import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { AuthState, DirectConversation, DirectMessage, Message, NotificationItem, ServerDetail } from '../api';
import { ChannelBadgeState } from '../components/WorkspaceSidebar';
import { ActiveCallSummary, SOCKET_URL } from '../helpers';

interface TypingUser {
  userId: string;
  displayName: string;
}

interface UseRealtimeSocketOptions {
  auth: AuthState | null;
  activeChannelIdRef: RefObject<string | null>;
  activeConversationId?: string | null;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  markChannelRead: (channelId: string, messageId?: string) => Promise<void>;
  markDirectConversationRead: (conversationId: string, messageId?: string) => Promise<void>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setDirectMessages: Dispatch<SetStateAction<DirectMessage[]>>;
  setDirectConversations: Dispatch<SetStateAction<DirectConversation[]>>;
  setTypingUsers: Dispatch<SetStateAction<TypingUser[]>>;
  setServer: Dispatch<SetStateAction<ServerDetail | null>>;
  setActiveCalls: Dispatch<SetStateAction<Record<string, ActiveCallSummary>>>;
  setChannelBadges: Dispatch<SetStateAction<Record<string, ChannelBadgeState>>>;
  loadFriends: (token?: string) => Promise<void>;
  loadDirectConversations: (token?: string) => Promise<void>;
  pushNotification: (notification: NotificationItem, unreadCount: number) => void;
  setNotificationUnreadCount: Dispatch<SetStateAction<number>>;
}

export function useRealtimeSocket({
  auth,
  activeChannelIdRef,
  activeConversationId,
  decryptMessageForDisplay,
  markChannelRead,
  markDirectConversationRead,
  setMessages,
  setDirectMessages,
  setDirectConversations,
  setTypingUsers,
  setServer,
  setActiveCalls,
  setChannelBadges,
  loadFriends,
  loadDirectConversations,
  pushNotification,
  setNotificationUnreadCount,
}: UseRealtimeSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId ?? null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId ?? null;
  }, [activeConversationId]);

  useEffect(() => {
    if (!auth) {
      socket?.disconnect();
      setSocket(null);
      return;
    }

    const nextSocket = io(SOCKET_URL, {
      auth: { token: auth.accessToken },
    });

    nextSocket.on('connect', () => {
      nextSocket.emit('unread:get', (result?: { counts?: Record<string, number> }) => {
        setChannelBadges((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(result?.counts ?? {}).map(([channelId, count]) => [
              channelId,
              { count, mentions: current[channelId]?.mentions ?? 0 },
            ]),
          ),
        }));
      });
    });

    nextSocket.on(
      'unread:updated',
      (payload: { channelId: string; count: number; mentions: number }) => {
        if (payload.channelId === activeChannelIdRef.current) return;
        setChannelBadges((current) => {
          const currentBadge = current[payload.channelId] ?? { count: 0, mentions: 0 };
          return {
            ...current,
            [payload.channelId]: {
              count: currentBadge.count + payload.count,
              mentions: currentBadge.mentions + payload.mentions,
            },
          };
        });
      },
    );

    nextSocket.on('unread:cleared', (payload: { channelId: string }) => {
      setChannelBadges((current) => {
        const next = { ...current };
        delete next[payload.channelId];
        return next;
      });
    });

    nextSocket.on(RealtimeEvents.MessageCreated, async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      if (message.channelId === activeChannelIdRef.current) {
        setMessages((current) =>
          current.some((item) => item.id === displayMessage.id)
            ? current
            : [...current, displayMessage],
        );
        void markChannelRead(message.channelId, message.id);
      }
    });

    nextSocket.on(RealtimeEvents.MessageUpdated, async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      setMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    });

    nextSocket.on(RealtimeEvents.MessageDeleted, async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      setMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    });

    nextSocket.on(RealtimeEvents.DmCreated, (message: DirectMessage) => {
      if (message.conversationId === activeConversationIdRef.current) {
        setDirectMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        );
        void markDirectConversationRead(message.conversationId, message.id);
      }

      setDirectConversations((current) => {
        const existing = current.find((conversation) => conversation.id === message.conversationId);
        if (!existing) return current;
        const updated = {
          ...existing,
          messages: [message],
          updatedAt: message.createdAt,
          unreadCount:
            message.conversationId === activeConversationIdRef.current
              ? 0
              : (existing.unreadCount ?? 0),
        };
        return [
          updated,
          ...current.filter((conversation) => conversation.id !== message.conversationId),
        ];
      });
    });

    nextSocket.on(RealtimeEvents.DmUnread, (payload: { conversationId: string; count?: number }) => {
      setDirectConversations((current) => {
        const existing = current.find((conversation) => conversation.id === payload.conversationId);
        if (!existing) return current;
        const updated = {
          ...existing,
          unreadCount:
            payload.conversationId === activeConversationIdRef.current ? 0 : (payload.count ?? 0),
        };
        return [
          updated,
          ...current.filter((conversation) => conversation.id !== payload.conversationId),
        ];
      });
    });

    nextSocket.on(RealtimeEvents.FriendRequest, () => {
      void loadFriends(auth.accessToken);
    });

    nextSocket.on(RealtimeEvents.FriendUpdated, () => {
      void loadFriends(auth.accessToken);
      void loadDirectConversations(auth.accessToken);
    });

    nextSocket.on(
      RealtimeEvents.NotificationCreated,
      (payload: { notification: NotificationItem; unreadCount: number }) => {
        pushNotification(payload.notification, payload.unreadCount);
      },
    );

    nextSocket.on(RealtimeEvents.NotificationUnread, (payload: { unreadCount: number }) => {
      setNotificationUnreadCount(payload.unreadCount);
    });

    nextSocket.on(RealtimeEvents.ReactionUpdated, async (payload: { message: Message }) => {
      const displayMessage = await decryptMessageForDisplay(payload.message);
      setMessages((current) =>
        current.map((message) => (message.id === displayMessage.id ? displayMessage : message)),
      );
    });

    nextSocket.on(
      RealtimeEvents.TypingStart,
      (payload: { channelId: string; userId: string; displayName?: string }) => {
        if (payload.userId === auth.user.id) return;
        setTypingUsers((current) =>
          current.some((user) => user.userId === payload.userId)
            ? current
            : [
                ...current,
                {
                  userId: payload.userId,
                  displayName: payload.displayName ?? 'Someone',
                },
              ],
        );
      },
    );

    nextSocket.on(RealtimeEvents.TypingStop, (payload: { channelId: string; userId: string }) => {
      setTypingUsers((current) => current.filter((user) => user.userId !== payload.userId));
    });

    nextSocket.on(RealtimeEvents.PresenceUpdate, (payload: { userId: string; status: string }) => {
      setServer((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.user.id === payload.userId
                  ? { ...member, user: { ...member.user, status: payload.status } }
                  : member,
              ),
            }
          : current,
      );
    });

    nextSocket.on('voice:active', (activeCall: ActiveCallSummary) => {
      setActiveCalls((current) => ({ ...current, [activeCall.channelId]: activeCall }));
    });

    nextSocket.on('voice:ended', (payload: { channelId: string }) => {
      setActiveCalls((current) => {
        const next = { ...current };
        delete next[payload.channelId];
        return next;
      });
    });

    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [auth?.accessToken]);

  return socket;
}
