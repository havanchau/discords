import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthState, DirectConversation, DirectMessage, Message, ServerDetail } from '../api';
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
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setDirectMessages: Dispatch<SetStateAction<DirectMessage[]>>;
  setDirectConversations: Dispatch<SetStateAction<DirectConversation[]>>;
  setTypingUsers: Dispatch<SetStateAction<TypingUser[]>>;
  setServer: Dispatch<SetStateAction<ServerDetail | null>>;
  setActiveCalls: Dispatch<SetStateAction<Record<string, ActiveCallSummary>>>;
  setChannelBadges: Dispatch<SetStateAction<Record<string, ChannelBadgeState>>>;
}

export function useRealtimeSocket({
  auth,
  activeChannelIdRef,
  activeConversationId,
  decryptMessageForDisplay,
  markChannelRead,
  setMessages,
  setDirectMessages,
  setDirectConversations,
  setTypingUsers,
  setServer,
  setActiveCalls,
  setChannelBadges,
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

    nextSocket.on('message:created', async (message: Message) => {
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

    nextSocket.on('message:updated', async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      setMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    });

    nextSocket.on('message:deleted', async (message: Message) => {
      const displayMessage = await decryptMessageForDisplay(message);
      setMessages((current) =>
        current.map((item) => (item.id === displayMessage.id ? displayMessage : item)),
      );
    });

    nextSocket.on('dm:created', (message: DirectMessage) => {
      if (message.conversationId === activeConversationIdRef.current) {
        setDirectMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        );
      }

      setDirectConversations((current) => {
        const existing = current.find((conversation) => conversation.id === message.conversationId);
        if (!existing) return current;
        const updated = {
          ...existing,
          messages: [message],
          updatedAt: message.createdAt,
        };
        return [
          updated,
          ...current.filter((conversation) => conversation.id !== message.conversationId),
        ];
      });
    });

    nextSocket.on('dm:unread', (payload: { conversationId: string }) => {
      if (payload.conversationId === activeConversationIdRef.current) return;
      setDirectConversations((current) => {
        const existing = current.find((conversation) => conversation.id === payload.conversationId);
        return existing
          ? [
              existing,
              ...current.filter((conversation) => conversation.id !== payload.conversationId),
            ]
          : current;
      });
    });

    nextSocket.on('reaction:updated', async (payload: { message: Message }) => {
      const displayMessage = await decryptMessageForDisplay(payload.message);
      setMessages((current) =>
        current.map((message) => (message.id === displayMessage.id ? displayMessage : message)),
      );
    });

    nextSocket.on(
      'typing:start',
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

    nextSocket.on('typing:stop', (payload: { channelId: string; userId: string }) => {
      setTypingUsers((current) => current.filter((user) => user.userId !== payload.userId));
    });

    nextSocket.on('presence:update', (payload: { userId: string; status: string }) => {
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
