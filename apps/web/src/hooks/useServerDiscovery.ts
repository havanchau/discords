import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  type DiscoveryJoinResult,
  type DiscoveryServerPage,
  type ReportServerInput,
  type ServerDiscoverySettings,
  type UpdateServerDiscoveryInput,
} from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/** A server's discovery listing settings, for MANAGE_SERVER holders; the API re-checks. */
export function useServerDiscoverySettings(serverId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.serverDiscovery(serverId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => apiRequest<ServerDiscoverySettings>(`/servers/${serverId}/discovery`, {}, token),
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateServerDiscoveryInput) =>
      apiRequest<ServerDiscoverySettings>(
        `/servers/${serverId}/discovery`,
        { method: 'PATCH', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: (settings) => queryClient.setQueryData(queryKey, settings),
  });

  return {
    settings: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    updateSettings: updateMutation.mutateAsync,
    isSaving: updateMutation.isPending,
  };
}

/** The public directory: one page per request, sorted by member count, searchable by text and tag. */
export function useDiscoveryDirectory(searchText: string, tag: string | null) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;

  const query = useInfiniteQuery({
    queryKey: queryKeys.discoveryServers(searchText, tag),
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (searchText) params.set('query', searchText);
      if (tag) params.set('tag', tag);
      if (pageParam) params.set('cursor', pageParam);
      const search = params.toString();
      return apiRequest<DiscoveryServerPage>(
        `/discovery/servers${search ? `?${search}` : ''}`,
        {},
        token,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const joinMutation = useMutation({
    mutationFn: (serverId: string) =>
      apiRequest<DiscoveryJoinResult>(
        `/discovery/servers/${serverId}/join`,
        { method: 'POST' },
        token,
      ),
    // The new server appears in the rail from the refetched list, as after an invite join.
    onSuccess: () =>
      queryClient.refetchQueries({ queryKey: queryKeys.servers(auth?.user.id ?? 'anonymous') }),
  });

  return {
    servers: query.data?.pages.flatMap((page) => page.servers) ?? [],
    isLoading: query.isPending,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    joinServer: joinMutation.mutateAsync,
    joiningId: joinMutation.isPending ? joinMutation.variables : null,
  };
}

export function useReportServer(serverId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;
  return useMutation({
    mutationFn: (input: ReportServerInput) =>
      apiRequest<{ ok: true }>(
        `/discovery/servers/${serverId}/report`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
  });
}
