import { Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, AuthState, Message, ThreadMessageResult } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';

interface UseThreadPanelOptions {
  auth: AuthState | null;
  socket: Socket | null;
  encryptForChannel: (channelId: string, plaintext: string) => Promise<string>;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  decryptMessagesForDisplay: (messages: Message[]) => Promise<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setWorkspaceError: (message: string | null) => void;
}

export function useThreadPanel({
  auth,
  socket,
  encryptForChannel,
  decryptMessageForDisplay,
  decryptMessagesForDisplay,
  setMessages,
  setWorkspaceError,
}: UseThreadPanelOptions) {
  const t = useTranslation();
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
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-load-thread'),
        );
      } finally {
        setIsThreadLoading(false);
      }
    },
    [auth, decryptMessagesForDisplay, socket, setWorkspaceError, t, updateRootMessage],
  );

  const closeThread = useCallback(() => {
    setRootMessage(null);
    setThreadMessages([]);
    setThreadDraft('');
  }, []);

  /** Posts one reply to the open thread; resolves whether it was accepted. */
  const postThreadMessage = useCallback(
    async (content: string, stickerId?: string) => {
      if (!auth || !rootMessage) return false;
      setIsThreadSending(true);
      setWorkspaceError(null);
      try {
        const messageContent = await encryptForChannel(rootMessage.channelId, content);
        const result = await apiRequest<ThreadMessageResult>(
          `/messages/${rootMessage.id}/thread/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ content: messageContent, stickerId }),
          },
          auth.accessToken,
        );
        await updateRootMessage(result.rootMessage);
        if (!result.message) return true;
        const displayMessage = await decryptMessageForDisplay(result.message);
        setThreadMessages((current) =>
          current.some((message) => message.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
        return true;
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-send-thread-reply'),
        );
        return false;
      } finally {
        setIsThreadSending(false);
      }
    },
    [
      auth,
      encryptForChannel,
      decryptMessageForDisplay,
      rootMessage,
      updateRootMessage,
      setWorkspaceError,
      t,
    ],
  );

  const sendThreadMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = threadDraft.trim();
      if (!content) return;
      if (await postThreadMessage(content)) setThreadDraft('');
    },
    [postThreadMessage, threadDraft],
  );

  /** Writes a changed message back into the panel: the root (and the channel list) or a reply. */
  const applyChangedMessage = useCallback(
    async (message: Message) => {
      if (message.id === rootMessage?.id) {
        await updateRootMessage(message);
        return;
      }
      const displayMessage = await decryptMessageForDisplay(message);
      setThreadMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    },
    [decryptMessageForDisplay, rootMessage?.id, updateRootMessage],
  );

  const deleteThreadMessage = useCallback(
    async (messageId: string) => {
      if (!auth) return;
      setWorkspaceError(null);
      try {
        const result = await apiRequest<{ message: Message }>(
          `/messages/${messageId}`,
          { method: 'DELETE' },
          auth.accessToken,
        );
        await applyChangedMessage(result.message);
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-delete-message'),
        );
      }
    },
    [auth, applyChangedMessage, setWorkspaceError, t],
  );

  /** Over the socket when connected, so other open panels get `reaction:updated`; REST otherwise. */
  const toggleThreadReaction = useCallback(
    async (message: Message, emoji: string) => {
      if (!auth) return;
      setWorkspaceError(null);
      if (socket?.connected) {
        socket.emit('reaction:toggle', {
          channelId: message.channelId,
          messageId: message.id,
          emoji,
        });
        return;
      }
      try {
        const result = await apiRequest<{ message: Message }>(
          `/messages/${message.id}/reactions`,
          { method: 'POST', body: JSON.stringify({ emoji }) },
          auth.accessToken,
        );
        await applyChangedMessage(result.message);
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-toggle-reaction'),
        );
      }
    },
    [auth, socket, applyChangedMessage, setWorkspaceError, t],
  );

  /** A sticker is its own reply; the draft is kept. */
  const sendThreadSticker = useCallback(
    async (stickerId: string) => {
      await postThreadMessage('', stickerId);
    },
    [postThreadMessage],
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
    // Reactions are broadcast to the channel room for roots and replies alike.
    const handleReaction = async (payload: { message: Message }) => {
      if (payload.message.id === rootMessage?.id) {
        await updateRootMessage(payload.message);
        return;
      }
      await handleChanged(payload.message);
    };
    socket.on('thread:message:created', handleCreated);
    socket.on('thread:message:updated', handleChanged);
    socket.on('thread:message:deleted', handleChanged);
    socket.on(RealtimeEvents.ReactionUpdated, handleReaction);
    return () => {
      socket.off('thread:message:created', handleCreated);
      socket.off('thread:message:updated', handleChanged);
      socket.off('thread:message:deleted', handleChanged);
      socket.off(RealtimeEvents.ReactionUpdated, handleReaction);
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
    sendSticker: sendThreadSticker,
    deleteMessage: deleteThreadMessage,
    toggleReaction: toggleThreadReaction,
    setDraft: setThreadDraft,
  };
}
