import { Dispatch, RefObject, SetStateAction, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthState, Message, ServerDetail } from '../api';
import { ChannelBadgeState } from '../components/WorkspaceSidebar';
import { ActiveCallSummary, SOCKET_URL } from '../helpers';

interface TypingUser {
  userId: string;
  displayName: string;
}

interface UseRealtimeSocketOptions {
  auth: AuthState | null;
  activeChannelIdRef: RefObject<string | null>;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  markChannelRead: (channelId: string, messageId?: string) => Promise<void>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setTypingUsers: Dispatch<SetStateAction<TypingUser[]>>;
  setServer: Dispatch<SetStateAction<ServerDetail | null>>;
  setActiveCalls: Dispatch<SetStateAction<Record<string, ActiveCallSummary>>>;
  setChannelBadges: Dispatch<SetStateAction<Record<string, ChannelBadgeState>>>;
}

export function useRealtimeSocket({
  auth,
  activeChannelIdRef,
  decryptMessageForDisplay,
  markChannelRead,
  setMessages,
  setTypingUsers,
  setServer,
  setActiveCalls,
  setChannelBadges,
}: UseRealtimeSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);

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
