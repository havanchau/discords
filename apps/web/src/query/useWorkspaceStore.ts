import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, type Channel, type ServerDetail, type ServerSummary } from '../api';
import { queryKeys } from './queryKeys';

interface UseWorkspaceStoreOptions {
  token: string | undefined;
  userId: string | undefined;
  onUnauthorized: () => void;
  onError: (message: string) => void;
}

const noServers: ServerSummary[] = [];

/**
 * The single owner of the workspace's server data and of which server and channel are open.
 *
 * Before this existed, `server` and `servers` were `useState` in one hook whose setters were handed
 * to three other hooks as props, so any of them could write the shape however it liked. Writes now
 * go through the named mutators below, which is what lets the data live in the query cache at all:
 * there is one place that knows the cache key.
 *
 * `channel` is derived rather than stored. It used to be a second copy of a channel object, which
 * could disagree with the copy inside `server.channels` after a rename; selecting a channel now
 * records only its id.
 */
export function useWorkspaceStore({
  token,
  userId,
  onUnauthorized,
  onError,
}: UseWorkspaceStoreOptions) {
  const queryClient = useQueryClient();
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const hasOpenedInitialServer = useRef(false);

  const serversKey = queryKeys.servers(userId ?? 'anonymous');
  const serverKey = queryKeys.serverDetail(activeServerId ?? 'none');

  // Long-lived subscribers (the socket effect) capture the mutators once, so their identity must
  // never change; they read which server is open from a ref instead of from a closure.
  const serverKeyRef = useRef(serverKey);
  const serversKeyRef = useRef(serversKey);
  serverKeyRef.current = serverKey;
  serversKeyRef.current = serversKey;

  const serversQuery = useQuery({
    queryKey: serversKey,
    enabled: Boolean(token && userId),
    queryFn: () =>
      apiRequest<{ servers: ServerSummary[] }>('/servers', {}, token).then(
        (result) => result.servers,
      ),
  });

  const serverQuery = useQuery({
    queryKey: serverKey,
    enabled: Boolean(token && activeServerId),
    queryFn: () =>
      apiRequest<{ server: ServerDetail }>(`/servers/${activeServerId}`, {}, token).then(
        (result) => result.server,
      ),
  });

  const servers = serversQuery.data ?? noServers;
  const server = serverQuery.data ?? null;

  const channel = useMemo(
    () => server?.channels.find((item) => item.id === activeChannelId) ?? null,
    [server, activeChannelId],
  );

  // A 401 here means the stored session is gone, which the caller handles by signing out.
  useEffect(() => {
    const error = serversQuery.error;
    if (!error) return;
    if (error instanceof Error && error.message.includes('401')) {
      onUnauthorized();
      return;
    }
    onError(error instanceof Error ? error.message : '');
  }, [serversQuery.error, onUnauthorized, onError]);

  // Opening the first server is a first-load convenience, not a rule: once the user goes home,
  // staying there has to survive the list refetching.
  useEffect(() => {
    if (hasOpenedInitialServer.current || activeServerId || !servers.length) return;
    hasOpenedInitialServer.current = true;
    setActiveServerId(servers[0].id);
  }, [servers, activeServerId]);

  // The open channel must exist in the open server, whether the server just loaded or the channel
  // was deleted underneath us.
  useEffect(() => {
    if (!server) return;
    if (server.channels.some((item) => item.id === activeChannelId)) return;
    setActiveChannelId(server.channels[0]?.id ?? null);
  }, [server, activeChannelId]);

  /** The only write path into the open server. Does nothing when no server is open. */
  const patchServer = useCallback(
    (update: (current: ServerDetail) => ServerDetail) => {
      queryClient.setQueryData<ServerDetail>(serverKeyRef.current, (current) =>
        current ? update(current) : current,
      );
    },
    [queryClient],
  );

  /** The only write path into the server list. */
  const patchServers = useCallback(
    (update: (current: ServerSummary[]) => ServerSummary[]) => {
      queryClient.setQueryData<ServerSummary[]>(serversKeyRef.current, (current) =>
        update(current ?? []),
      );
    },
    [queryClient],
  );

  /** Seeds the cache with a detail the caller already has, e.g. after creating or joining. */
  const seedServerDetail = useCallback(
    (detail: ServerDetail) => {
      queryClient.setQueryData<ServerDetail>(queryKeys.serverDetail(detail.id), detail);
      hasOpenedInitialServer.current = true;
      setActiveServerId(detail.id);
      setActiveChannelId(detail.channels[0]?.id ?? null);
    },
    [queryClient],
  );

  const openServer = useCallback((serverId: string) => {
    hasOpenedInitialServer.current = true;
    setActiveServerId(serverId);
  }, []);

  const openHome = useCallback(() => {
    hasOpenedInitialServer.current = true;
    setActiveServerId(null);
    setActiveChannelId(null);
  }, []);

  const selectChannel = useCallback((channelOrId: Channel | string | null) => {
    if (channelOrId === null) {
      setActiveChannelId(null);
      return;
    }
    setActiveChannelId(typeof channelOrId === 'string' ? channelOrId : channelOrId.id);
  }, []);

  const refreshServers = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: serversKeyRef.current });
  }, [queryClient]);

  return {
    servers,
    server,
    channel,
    isLoadingServers: serversQuery.isFetching,
    openServer,
    openHome,
    selectChannel,
    patchServer,
    patchServers,
    seedServerDetail,
    refreshServers,
  };
}

export type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;
export type PatchServer = WorkspaceStore['patchServer'];
export type PatchServers = WorkspaceStore['patchServers'];
export type SelectChannel = WorkspaceStore['selectChannel'];
