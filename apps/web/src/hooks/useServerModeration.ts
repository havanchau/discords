import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents, type AccountDeletedPayload } from '@discord-clone/shared';
import { apiRequest, AuthState, ServerBanEntry, ServerDetail } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import type { PatchServer, PatchServers } from '@/query/useWorkspaceStore';
import { queryKeys } from '@/query/queryKeys';

interface UseServerModerationOptions {
  auth: AuthState | null;
  socket: Socket | null;
  server: ServerDetail | null;
  patchServer: PatchServer;
  patchServers: PatchServers;
  openHome: () => void;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

interface MemberRemovedPayload {
  serverId: string;
  userId: string;
  reason: 'KICK' | 'BAN' | 'LEAVE';
}

const noBans: ServerBanEntry[] = [];

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
  patchServer,
  patchServers,
  openHome,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseServerModerationOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  // The bans list is only fetched once the moderation panel asks for a specific server.
  const [bansServerId, setBansServerId] = useState<string | null>(null);
  const [bansError, setBansError] = useState<string | null>(null);
  const bansQueryKey = queryKeys.serverBans(bansServerId ?? 'none');

  const bansQuery = useQuery({
    queryKey: bansQueryKey,
    enabled: Boolean(auth && bansServerId),
    queryFn: () =>
      apiRequest<{ bans: ServerBanEntry[] }>(
        `/servers/${bansServerId}/bans`,
        {},
        auth?.accessToken,
      ),
  });
  const bans = bansQuery.data?.bans ?? noBans;
  const isLoadingBans = bansQuery.isFetching;

  const writeBans = (update: (current: ServerBanEntry[]) => ServerBanEntry[]) => {
    queryClient.setQueryData<{ bans: ServerBanEntry[] }>(bansQueryKey, (current) =>
      current ? { bans: update(current.bans) } : current,
    );
  };
  const viewerIdRef = useRef<string | null>(null);
  const serverRef = useRef<ServerDetail | null>(null);
  const noticeRef = useRef(setWorkspaceNotice);
  const tRef = useRef(t);

  useEffect(() => {
    viewerIdRef.current = auth?.user.id ?? null;
    serverRef.current = server;
    noticeRef.current = setWorkspaceNotice;
    tRef.current = t;
  }, [auth?.user.id, server, setWorkspaceNotice, t]);

  useEffect(() => {
    if (!socket) return;

    const handleMemberRemoved = (payload: MemberRemovedPayload) => {
      if (payload.userId === viewerIdRef.current) {
        const removedFrom = serverRef.current?.id === payload.serverId ? serverRef.current : null;
        patchServers((current) => current.filter((item) => item.id !== payload.serverId));
        if (removedFrom) {
          openHome();
          noticeRef.current(
            payload.reason === 'BAN'
              ? `You were banned from ${removedFrom.name}.`
              : payload.reason === 'LEAVE'
                ? tRef.current('serverSettings.danger.leftNotice', { server: removedFrom.name })
                : `You were removed from ${removedFrom.name}.`,
          );
        }
        return;
      }
      patchServer((current) =>
        current.id === payload.serverId
          ? {
              ...current,
              members: current.members.filter((member) => member.user.id !== payload.userId),
            }
          : current,
      );
    };

    const handleMemberUpdated = (payload: MemberUpdatedPayload) => {
      patchServer((current) =>
        current.id === payload.serverId
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

    // An anonymized account left every server at once; the open server drops it from the roster.
    const handleAccountDeleted = (payload: AccountDeletedPayload) => {
      patchServer((current) =>
        current.members.some((member) => member.user.id === payload.userId)
          ? {
              ...current,
              members: current.members.filter((member) => member.user.id !== payload.userId),
            }
          : current,
      );
    };

    // `needsOnboarding` lives on the server detail, so screening changes refetch it.
    const handleOnboardingUpdated = (payload: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverDetail(payload.serverId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.serverOnboarding(payload.serverId),
      });
    };

    // Member kinds changed on both sides; the detail refetch moves owner-only UI to the new owner.
    const handleOwnershipTransferred = (payload: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverDetail(payload.serverId) });
    };

    const handleServerDeleted = (payload: { serverId: string }) => {
      const deleted = serverRef.current?.id === payload.serverId ? serverRef.current : null;
      patchServers((current) => current.filter((item) => item.id !== payload.serverId));
      if (deleted) {
        openHome();
        noticeRef.current(
          tRef.current('serverSettings.danger.deletedNotice', { server: deleted.name }),
        );
      }
    };

    socket.on(RealtimeEvents.ServerMemberRemoved, handleMemberRemoved);
    socket.on(RealtimeEvents.ServerOwnershipTransferred, handleOwnershipTransferred);
    socket.on(RealtimeEvents.ServerDeleted, handleServerDeleted);
    socket.on(RealtimeEvents.ServerMemberUpdated, handleMemberUpdated);
    socket.on(RealtimeEvents.AccountDeleted, handleAccountDeleted);
    socket.on(RealtimeEvents.ServerOnboardingUpdated, handleOnboardingUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerMemberRemoved, handleMemberRemoved);
      socket.off(RealtimeEvents.ServerOwnershipTransferred, handleOwnershipTransferred);
      socket.off(RealtimeEvents.ServerDeleted, handleServerDeleted);
      socket.off(RealtimeEvents.ServerMemberUpdated, handleMemberUpdated);
      socket.off(RealtimeEvents.AccountDeleted, handleAccountDeleted);
      socket.off(RealtimeEvents.ServerOnboardingUpdated, handleOnboardingUpdated);
    };
  }, [socket, openHome, patchServer, patchServers, queryClient]);

  // The server id is part of the query key, so a slow response for the previous server can no
  // longer land on the current one; the manual ref guard this used to need is gone.
  async function loadBans(serverId: string) {
    if (!auth) return;
    setBansError(null);
    setBansServerId(serverId);
    const result = await queryClient.refetchQueries({ queryKey: queryKeys.serverBans(serverId) });
    void result;
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
      writeBans((current) => [result.ban, ...current.filter((ban) => ban.id !== result.ban.id)]);
      patchServer((current) =>
        current.id === serverId
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
      writeBans((current) => current.filter((ban) => ban.user.id !== userId));
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
      patchServer((current) =>
        current.id === serverId
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-timeout'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  /** Drops a server this viewer is no longer in; the realtime event may arrive before or after. */
  function dropServer(serverId: string, notice: string) {
    patchServers((current) => current.filter((item) => item.id !== serverId));
    openHome();
    setWorkspaceNotice(notice);
  }

  /** Resolves to `null` on success, or the message to show next to the form. */
  async function runOwnershipAction(action: string, request: () => Promise<void>) {
    setPendingAction(action);
    try {
      await request();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t('serverSettings.danger.error');
    } finally {
      setPendingAction(null);
    }
  }

  function leaveServer() {
    if (!auth || !server) return Promise.resolve(null);
    const { id, name } = server;
    return runOwnershipAction('server-leave', async () => {
      await apiRequest(`/servers/${id}/members/me`, { method: 'DELETE' }, auth.accessToken);
      dropServer(id, t('serverSettings.danger.leftNotice', { server: name }));
    });
  }

  function transferOwnership(userId: string, password: string, code: string) {
    if (!auth || !server) return Promise.resolve(null);
    const serverId = server.id;
    return runOwnershipAction('server-transfer', async () => {
      const result = await apiRequest<{ server: ServerDetail }>(
        `/servers/${serverId}/transfer`,
        { method: 'POST', body: JSON.stringify({ userId, password, code: code || undefined }) },
        auth.accessToken,
      );
      patchServer((current) => (current.id === serverId ? result.server : current));
    });
  }

  function deleteServer(password: string, code: string) {
    if (!auth || !server) return Promise.resolve(null);
    const { id, name } = server;
    return runOwnershipAction('server-delete', async () => {
      await apiRequest(
        `/servers/${id}`,
        { method: 'DELETE', body: JSON.stringify({ password, code: code || undefined }) },
        auth.accessToken,
      );
      dropServer(id, t('serverSettings.danger.deletedNotice', { server: name }));
    });
  }

  return {
    bans,
    isLoadingBans,
    bansError,
    loadBans,
    banMember,
    unbanUser,
    timeoutMember,
    leaveServer,
    transferOwnership,
    deleteServer,
  };
}
