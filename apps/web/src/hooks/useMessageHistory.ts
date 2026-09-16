import type { Dispatch, SetStateAction } from 'react';
import { apiRequest, type AuthState, type Channel, type Message } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';

interface UseMessageHistoryOptions {
  auth: AuthState | null;
  channel: Channel | null;
  messageCursor: string | null;
  isLoadingMoreMessages: boolean;
  decryptMessagesForDisplay: (messages: Message[]) => Promise<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessageCursor: Dispatch<SetStateAction<string | null>>;
  setIsLoadingMoreMessages: Dispatch<SetStateAction<boolean>>;
  setWorkspaceError: Dispatch<SetStateAction<string | null>>;
}

export function useMessageHistory({
  auth,
  channel,
  messageCursor,
  isLoadingMoreMessages,
  decryptMessagesForDisplay,
  setMessages,
  setMessageCursor,
  setIsLoadingMoreMessages,
  setWorkspaceError,
}: UseMessageHistoryOptions) {
  const t = useTranslation();
  async function loadMoreMessages() {
    if (!auth || !channel || !messageCursor || isLoadingMoreMessages) return;
    setIsLoadingMoreMessages(true);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ messages: Message[]; nextCursor?: string | null }>(
        `/channels/${channel.id}/messages?cursor=${encodeURIComponent(messageCursor)}`,
        {},
        auth.accessToken,
      );
      const displayMessages = await decryptMessagesForDisplay(result.messages);
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        const olderMessages = displayMessages.filter((message) => !existingIds.has(message.id));
        return [...olderMessages, ...current];
      });
      setMessageCursor(result.nextCursor ?? null);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-load-older-messages'),
      );
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }

  return { loadMoreMessages };
}
