import { useCallback, useMemo, useState } from 'react';
import { apiRequest, Channel, Message } from '../api';
import { buildMessageSearchParams, parseMessageSearchQuery } from '../utils/messageSearch';

interface UseChatOrchestratorProps {
  auth: { accessToken: string } | null;
  channel: Channel | null;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (error: string | null) => void;
}

export function useChatOrchestrator({
  auth,
  channel,
  setPendingAction,
  setWorkspaceError,
}: UseChatOrchestratorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [pinnedMessagesByChannel, setPinnedMessagesByChannel] = useState<
    Record<string, Message[]>
  >({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<{ userId: string; displayName: string }[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Record<string, string[]>>({});

  const loadPinnedMessages = useCallback(
    async (channelId: string, token: string) => {
      try {
        const data = await apiRequest<{ pinnedMessages?: Message[]; messages?: Message[] }>(
          `/channels/${channelId}/pins`,
          {},
          token,
        );
        const pinnedList = data.messages ?? data.pinnedMessages ?? [];
        setPinnedMessagesByChannel((current) => ({
          ...current,
          [channelId]: pinnedList,
        }));
        setPinnedMessageIds((current) => ({
          ...current,
          [channelId]: pinnedList.map((msg) => msg.id),
        }));
      } catch {
        // Ignored for non-essential pin loading
      }
    },
    [],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const target = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    target.dataset.jumpHighlight = 'true';
    window.setTimeout(() => {
      delete target.dataset.jumpHighlight;
    }, 1400);
  }, []);

  const togglePinnedMessage = useCallback(
    async (message: Message) => {
      if (!auth) return;
      setPendingAction(`pin-${message.id}`);
      setWorkspaceError(null);
      try {
        await apiRequest<{ pinned: boolean; message: Message }>(
          `/messages/${message.id}/pins`,
          { method: 'POST' },
          auth.accessToken,
        );
        if (channel) {
          await loadPinnedMessages(channel.id, auth.accessToken);
        }
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot toggle pin');
      } finally {
        setPendingAction(null);
      }
    },
    [auth, channel, loadPinnedMessages, setPendingAction, setWorkspaceError],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!auth) return;
      try {
        const data = await apiRequest<{ message: Message }>(
          `/messages/${messageId}/reactions`,
          {
            method: 'POST',
            body: JSON.stringify({ emoji }),
          },
          auth.accessToken,
        );
        setMessages((current) =>
          current.map((item) => (item.id === messageId ? data.message : item)),
        );
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot toggle reaction');
      }
    },
    [auth, setWorkspaceError],
  );

  const parsedSearch = useMemo(() => parseMessageSearchQuery(searchQuery), [searchQuery]);

  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length >= 2 && searchResults) return searchResults;
    if (!query) return messages;
    return messages.filter(
      (message) => !message.decryptionFailed && message.content.toLowerCase().includes(query),
    );
  }, [messages, searchQuery, searchResults]);

  const pinnedMessages = channel ? (pinnedMessagesByChannel[channel.id] ?? []) : [];

  return {
    messages,
    setMessages,
    searchResults,
    setSearchResults,
    pinnedMessagesByChannel,
    isLoadingMessages,
    setIsLoadingMessages,
    isLoadingMoreMessages,
    setIsLoadingMoreMessages,
    messageCursor,
    setMessageCursor,
    editingMessageId,
    setEditingMessageId,
    editingDraft,
    setEditingDraft,
    replyingToMessage,
    setReplyingToMessage,
    searchQuery,
    setSearchQuery,
    typingUsers,
    setTypingUsers,
    pinnedMessageIds,
    setPinnedMessageIds,
    parsedSearch,
    visibleMessages,
    pinnedMessages,
    loadPinnedMessages,
    jumpToMessage,
    togglePinnedMessage,
    toggleReaction,
  };
}
