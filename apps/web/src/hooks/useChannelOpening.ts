import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';
import { apiRequest, AuthState, Channel, Message } from '@/api';
import type { ChannelBadgeState } from '@/components/WorkspaceSidebar';
import type { ActiveCallSummary } from '@/helpers';
import type { Translate } from '@/i18n/LocaleProvider';

interface UseChannelOpeningOptions {
  channel: Channel | null;
  auth: AuthState | null;
  socket: Socket | null;
  activeChannelIdRef: MutableRefObject<string | null>;
  decryptMessagesForDisplay: (messages: Message[]) => Promise<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsLoadingMessages: (isLoading: boolean) => void;
  setMessageCursor: (cursor: string | null) => void;
  setTypingUsers: Dispatch<SetStateAction<Array<{ userId: string; displayName: string }>>>;
  setChannelBadges: Dispatch<SetStateAction<Record<string, ChannelBadgeState>>>;
  setReplyingToMessage: (message: Message | null) => void;
  closeThread: () => void;
  setSearchResults: (results: null) => void;
  setWorkspaceError: (error: string | null) => void;
  loadPinnedMessages: (channelId: string, accessToken: string) => Promise<void> | void;
  setActiveCalls: Dispatch<SetStateAction<Record<string, ActiveCallSummary>>>;
  t: Translate;
}

/** Resets and refetches channel state (messages, unread marker, pins, active call) when the open channel changes. */
export function useChannelOpening({
  channel,
  auth,
  socket,
  activeChannelIdRef,
  decryptMessagesForDisplay,
  setMessages,
  setIsLoadingMessages,
  setMessageCursor,
  setTypingUsers,
  setChannelBadges,
  setReplyingToMessage,
  closeThread,
  setSearchResults,
  setWorkspaceError,
  loadPinnedMessages,
  setActiveCalls,
  t,
}: UseChannelOpeningOptions) {
  useEffect(() => {
    activeChannelIdRef.current = channel?.id ?? null;
  }, [channel?.id, activeChannelIdRef]);

  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);

  const openChannel = useEffectEvent(() => {
    if (!channel || !auth) return;
    setIsLoadingMessages(true);
    setMessageCursor(null);
    setFirstUnreadMessageId(null);
    setTypingUsers([]);
    setChannelBadges((current) => {
      const next = { ...current };
      delete next[channel.id];
      return next;
    });
    setReplyingToMessage(null);
    closeThread();
    setSearchResults(null);
    setWorkspaceError(null);
    void apiRequest<{
      messages: Message[];
      nextCursor?: string | null;
      lastReadMessageId?: string | null;
      lastReadAt?: string | null;
    }>(`/channels/${channel.id}/messages`, {}, auth.accessToken)
      .then(async (result) => {
        const displayMessages = await decryptMessagesForDisplay(result.messages);
        setMessages(displayMessages);
        setMessageCursor(result.nextCursor ?? null);

        let unreadId: string | null = null;
        if (result.lastReadAt && displayMessages.length > 0) {
          const lastReadTime = new Date(result.lastReadAt).getTime();
          const firstMsgTime = new Date(displayMessages[0].createdAt).getTime();
          const lastMsgTime = new Date(
            displayMessages[displayMessages.length - 1].createdAt,
          ).getTime();

          if (lastReadTime < firstMsgTime) {
            // The last read message is older than everything loaded on this page: the divider
            // goes above the first loaded message rather than being hidden.
            unreadId = displayMessages[0].id;
          } else if (lastReadTime < lastMsgTime) {
            const firstUnread = displayMessages.find(
              (m) => new Date(m.createdAt).getTime() > lastReadTime,
            );
            unreadId = firstUnread?.id ?? null;
          }
        } else if (result.lastReadMessageId && displayMessages.length > 0) {
          const idx = displayMessages.findIndex((m) => m.id === result.lastReadMessageId);
          if (idx !== -1 && idx < displayMessages.length - 1) {
            unreadId = displayMessages[idx + 1].id;
          }
        }
        setFirstUnreadMessageId(unreadId);
      })
      .catch((err) =>
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-load-messages'),
        ),
      )
      .finally(() => setIsLoadingMessages(false));
    void loadPinnedMessages(channel.id, auth.accessToken);
    socket?.emit(
      'channel:join',
      { channelId: channel.id },
      (result?: { activeCall?: ActiveCallSummary | null }) => {
        setActiveCalls((current) => {
          const next = { ...current };
          if (result?.activeCall) {
            next[channel.id] = result.activeCall;
          } else {
            delete next[channel.id];
          }
          return next;
        });
      },
    );
  });
  // Opening a channel resets and refetches its state, so it runs on a new channel, token or socket only.
  useEffect(() => {
    openChannel();
  }, [channel?.id, auth?.accessToken, socket]);

  return { firstUnreadMessageId };
}
