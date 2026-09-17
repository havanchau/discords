import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { Socket } from 'socket.io-client';
import { apiRequest, AuthState, Channel, Message, Poll } from '@/api';
import type { ChannelMessageActions } from '@/components/chat/types';
import { encryptChannelMessage } from '@/e2ee';
import { updatePollInMessages } from '@/utils/polls';

interface UseChannelMessageActionsOptions {
  auth: AuthState | null;
  socket: Socket | null;
  channel: Channel | null;
  messages: Message[];
  channelKeysRef: MutableRefObject<Record<string, CryptoKey>>;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  editingMessageId: string | null;
  editingDraft: string;
  setEditingMessageId: (messageId: string | null) => void;
  setEditingDraft: (draft: string) => void;
  setReplyingToMessage: (message: Message | null) => void;
  openThread: (message: Message) => Promise<void>;
  togglePinnedMessage: (message: Message) => Promise<void>;
  canManageMessages: boolean;
}

/** Edit, delete, react, and pin actions for channel message rows, with stable identities. */
export function useChannelMessageActions({
  auth,
  socket,
  channel,
  messages,
  channelKeysRef,
  decryptMessageForDisplay,
  setMessages,
  editingMessageId,
  editingDraft,
  setEditingMessageId,
  setEditingDraft,
  setReplyingToMessage,
  openThread,
  togglePinnedMessage,
  canManageMessages,
}: UseChannelMessageActionsOptions) {
  // Read through a ref so saveMessageEdit keeps its identity when new messages arrive.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const saveMessageEdit = useCallback(
    async (messageId: string) => {
      if (!auth || !editingDraft.trim()) return;
      const editingMessage = messagesRef.current.find((message) => message.id === messageId);
      const channelKey = editingMessage ? channelKeysRef.current[editingMessage.channelId] : null;
      const content = channelKey
        ? await encryptChannelMessage(channelKey, editingDraft.trim())
        : editingDraft.trim();
      const result = await apiRequest<{ message: Message }>(
        `/messages/${messageId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        },
        auth.accessToken,
      );
      const displayMessage = await decryptMessageForDisplay(result.message);
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? displayMessage : message)),
      );
      setEditingMessageId(null);
      setEditingDraft('');
    },
    [
      auth,
      editingDraft,
      channelKeysRef,
      decryptMessageForDisplay,
      setMessages,
      setEditingMessageId,
      setEditingDraft,
    ],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!auth) return;
      await apiRequest<{ message: Message }>(
        `/messages/${messageId}`,
        { method: 'DELETE' },
        auth.accessToken,
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: '', deletedAt: new Date().toISOString() }
            : message,
        ),
      );
    },
    [auth, setMessages],
  );

  const toggleReaction = useCallback(
    async (message: Message, emoji: string) => {
      if (!auth) return;
      if (socket?.connected && channel) {
        socket.emit('reaction:toggle', { channelId: channel.id, messageId: message.id, emoji });
        return;
      }
      const result = await apiRequest<{ message: Message }>(
        `/messages/${message.id}/reactions`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        },
        auth.accessToken,
      );
      const displayMessage = await decryptMessageForDisplay(result.message);
      setMessages((current) =>
        current.map((currentMessage) =>
          currentMessage.id === message.id ? displayMessage : currentMessage,
        ),
      );
    },
    [auth, socket, channel, decryptMessageForDisplay, setMessages],
  );

  const updatePoll = useCallback(
    (poll: Poll) => setMessages((current) => updatePollInMessages(current, poll.id, () => poll)),
    [setMessages],
  );

  const messageActions = useMemo<ChannelMessageActions>(
    () => ({
      editingMessageId,
      editingDraft,
      setReplyingToMessage,
      openThread: (message) => void openThread(message),
      setEditingMessageId,
      setEditingDraft,
      saveEdit: saveMessageEdit,
      delete: deleteMessage,
      toggleReaction,
      togglePinned: (message) => void togglePinnedMessage(message),
      updatePoll,
      canManageMessages,
    }),
    [
      editingMessageId,
      editingDraft,
      setReplyingToMessage,
      openThread,
      setEditingMessageId,
      setEditingDraft,
      saveMessageEdit,
      deleteMessage,
      toggleReaction,
      togglePinnedMessage,
      updatePoll,
      canManageMessages,
    ],
  );

  return messageActions;
}
