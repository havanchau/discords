import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import {
  apiRequest,
  AuthState,
  Channel,
  ServerBanEntry,
  ServerDetail,
  ServerSummary,
} from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

interface UseServerModerationOptions {
  auth: AuthState | null;
  socket: Socket | null;
  server: ServerDetail | null;
  setServer: Dispatch<SetStateAction<ServerDetail | null>>;
  setServers: Dispatch<SetStateAction<ServerSummary[]>>;
  setChannel: Dispatch<SetStateAction<Channel | null>>;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

interface MemberRemovedPayload {
  serverId: string;
  userId: string;
  reason: 'KICK' | 'BAN';
}

/** Partial by design: a publisher sends only the fields its change touched. */
interface MemberUpdatedPayload {
  serverId: string;
  memberId: string;
  userId?: string;
  timeoutUntil?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
}

export function useServerModeration({
  auth,
  socket,
  server,
  setServer,
  setServers,
  setChannel,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseServerModerationOptions) {
  const t = useTranslation();
  const [bans, setBans] = useState<ServerBanEntry[]>([]);
  const [isLoadingBans, setIsLoadingBans] = useState(false);
  const [bansError, setBansError] = useState<string | null>(null);
  const viewerIdRef = useRef<string | null>(null);
  const serverRef = useRef<ServerDetail | null>(null);
  const noticeRef = useRef(setWorkspaceNotice);

  useEffect(() => {
    viewerIdRef.current = auth?.user.id ?? null;
    serverRef.current = server;
    noticeRef.current = setWorkspaceNotice;
  }, [auth?.user.id, server, setWorkspaceNotice]);

  useEffect(() => {
    if (!socket) return;

    const handleMemberRemoved = (payload: MemberRemovedPayload) => {
      if (payload.userId === viewerIdRef.current) {
        const removedFrom = serverRef.current?.id === payload.serverId ? serverRef.current : null;
        setServers((current) => current.filter((item) => item.id !== payload.serverId));
        if (removedFrom) {
          setServer(null);
          setChannel(null);
          noticeRef.current(
            payload.reason === 'BAN'
              ? `You were banned from ${removedFrom.name}.`
              : `You were removed from ${removedFrom.name}.`,
          );
        }
        return;
      }
      setServer((current) =>
        current?.id === payload.serverId
          ? {
              ...current,
              members: current.members.filter((member) => member.user.id !== payload.userId),
            }
          : current,
      );
    };

    const handleMemberUpdated = (payload: MemberUpdatedPayload) => {
      setServer((current) =>
        current?.id === payload.serverId
          ? {
              ...current,
              // A partial payload: only the keys the change carried are merged, so a nickname
              // update does not clear `timeoutUntil` and vice versa.
              members: current.members.map((member) =>
                member.id === payload.memberId
                  ? {
                      ...member,
                      ...(payload.timeoutUntil !== undefined
                        ? { timeoutUntil: payload.timeoutUntil }
                        : {}),
                      ...(payload.nickname !== undefined ? { nickname: payload.nickname } : {}),
                      ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl } : {}),
                    }
                  : member,
              ),
            }
          : current,
      );
    };

    socket.on(RealtimeEvents.ServerMemberRemoved, handleMemberRemoved);
    socket.on(RealtimeEvents.ServerMemberUpdated, handleMemberUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerMemberRemoved, handleMemberRemoved);
      socket.off(RealtimeEvents.ServerMemberUpdated, handleMemberUpdated);
    };
  }, [socket, setChannel, setServer, setServers]);

  async function loadBans(serverId: string) {
    if (!auth) return;
    setIsLoadingBans(true);
    setBansError(null);
    try {
      const result = await apiRequest<{ bans: ServerBanEntry[] }>(
        `/servers/${serverId}/bans`,
        {},
        auth.accessToken,
      );
      if (serverRef.current?.id === serverId) setBans(result.bans);
    } catch (err) {
      if (serverRef.current?.id !== serverId) return;
      setBans([]);
      setBansError(err instanceof Error ? err.message : t('error.fallback.cannot-load-bans'));
    } finally {
      if (serverRef.current?.id === serverId) setIsLoadingBans(false);
    }
  }

  async function banMember(userId: string, reason: string) {
    if (!auth || !server) return false;
    const serverId = server.id;
    setPendingAction(`member-ban-${userId}`);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ ban: ServerBanEntry }>(
        `/servers/${serverId}/bans`,
        { method: 'POST', body: JSON.stringify({ userId, reason: reason.trim() || undefined }) },
        auth.accessToken,
      );
      setBans((current) => [result.ban, ...current.filter((ban) => ban.id !== result.ban.id)]);
      setServer((current) =>
        current?.id === serverId
          ? { ...current, members: current.members.filter((member) => member.user.id !== userId) }
          : current,
      );
      setWorkspaceNotice(`${result.ban.user.displayName} was banned.`);
      return true;
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : t('error.fallback.cannot-ban-member'));
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function unbanUser(userId: string) {
    if (!auth || !server) return;
    setPendingAction(`member-unban-${userId}`);
    setBansError(null);
    try {
      await apiRequest(
        `/servers/${server.id}/bans/${userId}`,
        { method: 'DELETE' },
        auth.accessToken,
      );
      setBans((current) => current.filter((ban) => ban.user.id !== userId));
    } catch (err) {
      setBansError(err instanceof Error ? err.message : t('error.fallback.cannot-unban-user'));
    } finally {
      setPendingAction(null);
    }
  }

  async function timeoutMember(memberId: string, durationMinutes: number) {
    if (!auth || !server) return;
    const serverId = server.id;
    setPendingAction(`member-timeout-${memberId}`);
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ member: { id: string; timeoutUntil: string | null } }>(
        `/servers/${serverId}/members/${memberId}/timeout`,
        { method: 'PUT', body: JSON.stringify({ durationMinutes }) },
        auth.accessToken,
      );
      setServer((current) =>
        current?.id === serverId
          ? {
              ...current,
              members: current.members.map((member) =>
                member.id === result.member.id
                  ? { ...member, timeoutUntil: result.member.timeoutUntil }
                  : member,
              ),
            }
          : current,
      );
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : t('error.fallback.cannot-update-timeout'));
    } finally {
      setPendingAction(null);
    }
  }

  return { bans, isLoadingBans, bansError, loadBans, banMember, unbanUser, timeoutMember };
}
