import {
  Dispatch,
  FormEvent,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';
import { apiRequest, AuthState, Message, ThreadMessageResult } from '../api';
import { encryptChannelMessage } from '../e2ee';

interface UseThreadPanelOptions {
  auth: AuthState | null;
  socket: Socket | null;
  channelKeysRef: RefObject<Record<string, CryptoKey>>;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  decryptMessagesForDisplay: (messages: Message[]) => Promise<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setWorkspaceError: (message: string | null) => void;
}

export function useThreadPanel({
  auth,
  socket,
  channelKeysRef,
  decryptMessageForDisplay,
  decryptMessagesForDisplay,
  setMessages,
  setWorkspaceError,
}: UseThreadPanelOptions) {
  const [rootMessage, setRootMessage] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadDraft, setThreadDraft] = useState('');
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isThreadSending, setIsThreadSending] = useState(false);

  const updateRootMessage = useCallback(
    async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      setRootMessage((current) => (current?.id === displayMessage.id ? displayMessage : current));
      setMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    },
    [decryptMessageForDisplay, setMessages],
  );

  const openThread = useCallback(
    async (message: Message) => {
      if (!auth) return;
      setRootMessage(message);
      setThreadDraft('');
      setIsThreadLoading(true);
      setWorkspaceError(null);
      try {
        const result = await apiRequest<ThreadMessageResult>(
          `/messages/${message.id}/thread`,
          {},
          auth.accessToken,
        );
        await updateRootMessage(result.rootMessage);
        setThreadMessages(await decryptMessagesForDisplay(result.messages ?? []));
        socket?.emit('thread:join', { rootMessageId: message.id });
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot load thread');
      } finally {
        setIsThreadLoading(false);
      }
    },
    [auth, decryptMessagesForDisplay, socket, setWorkspaceError, updateRootMessage],
  );

  const closeThread = useCallback(() => {
    setRootMessage(null);
    setThreadMessages([]);
    setThreadDraft('');
  }, []);

  const sendThreadMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!auth || !rootMessage) return;
      const content = threadDraft.trim();
      if (!content) return;
      setIsThreadSending(true);
      setWorkspaceError(null);
      try {
        const channelKey = channelKeysRef.current[rootMessage.channelId];
        const messageContent = channelKey
          ? await encryptChannelMessage(channelKey, content)
          : content;
        const result = await apiRequest<ThreadMessageResult>(
          `/messages/${rootMessage.id}/thread/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ content: messageContent }),
          },
          auth.accessToken,
        );
        await updateRootMessage(result.rootMessage);
        if (!result.message) return;
        const displayMessage = await decryptMessageForDisplay(result.message);
        setThreadMessages((current) =>
          current.some((message) => message.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
        setThreadDraft('');
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot send thread reply');
      } finally {
        setIsThreadSending(false);
      }
    },
    [
      auth,
      channelKeysRef,
      decryptMessageForDisplay,
      rootMessage,
      threadDraft,
      updateRootMessage,
      setWorkspaceError,
    ],
  );

  useEffect(() => {
    if (!socket) return;
    const handleCreated = async (payload: ThreadMessageResult) => {
      await updateRootMessage(payload.rootMessage);
      if (payload.rootMessage.id !== rootMessage?.id) return;
      if (!payload.message) return;
      const displayMessage = await decryptMessageForDisplay(payload.message);
      setThreadMessages((current) =>
        current.some((message) => message.id === displayMessage.id)
          ? current
          : [...current, displayMessage],
      );
    };
    const handleChanged = async (message: Message) => {
      if (message.threadId !== rootMessage?.thread?.id) return;
      const displayMessage = await decryptMessageForDisplay(message);
      setThreadMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    };
    socket.on('thread:message:created', handleCreated);
    socket.on('thread:message:updated', handleChanged);
    socket.on('thread:message:deleted', handleChanged);
    return () => {
      socket.off('thread:message:created', handleCreated);
      socket.off('thread:message:updated', handleChanged);
      socket.off('thread:message:deleted', handleChanged);
    };
  }, [
    decryptMessageForDisplay,
    rootMessage?.id,
    rootMessage?.thread?.id,
    socket,
    updateRootMessage,
  ]);

  return {
    rootMessage,
    messages: threadMessages,
    draft: threadDraft,
    isLoading: isThreadLoading,
    isSending: isThreadSending,
    openThread,
    close: closeThread,
    sendMessage: sendThreadMessage,
    setDraft: setThreadDraft,
  };
}
