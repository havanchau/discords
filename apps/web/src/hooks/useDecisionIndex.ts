import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RealtimeEvents } from '@discord-clone/shared';
import type { DecisionStatus } from '@discord-clone/shared';
import { apiRequest, DecisionListResult, DecisionView } from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';
import { patchDecisionInPages } from '@/utils/decisions';

export interface DecisionIndexFilters {
  status: DecisionStatus | null;
  channelId: string | null;
  from: string | null;
  to: string | null;
}

/**
 * The server-wide index of decisions that left `PROPOSED` (`GET /servers/:serverId/decisions`).
 * `decision:index-updated` carries ids only (the server room is not scoped per channel), so it
 * always triggers a refetch instead of a local patch — it now fires for both a manual
 * resolve/supersede and the automatic deadline sweep (`DecisionSweepService.emitUpdated`).
 */
export function useDecisionIndex(serverId: string, filters: DecisionIndexFilters) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const listKey = queryKeys.decisionsIndex(serverId, filters);

  const query = useInfiniteQuery({
    queryKey: listKey,
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (filters.status) params.set('status', filters.status);
      if (filters.channelId) params.set('channelId', filters.channelId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const search = params.toString();
      return apiRequest<DecisionListResult>(
        `/servers/${serverId}/decisions${search ? `?${search}` : ''}`,
        {},
        token,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  useEffect(() => {
    if (!socket) return;
    const handleIndexUpdated = (payload: { serverId: string }) => {
      if (payload.serverId !== serverId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.decisionsIndexOf(serverId) });
    };
    socket.on(RealtimeEvents.DecisionIndexUpdated, handleIndexUpdated);
    return () => {
      socket.off(RealtimeEvents.DecisionIndexUpdated, handleIndexUpdated);
    };
  }, [serverId, queryClient, socket]);

  function updateDecisionLocally(decision: DecisionView) {
    queryClient.setQueriesData(
      { queryKey: queryKeys.decisionsIndexOf(serverId) },
      (data: Parameters<typeof patchDecisionInPages>[0]) =>
        patchDecisionInPages(data, decision.id, () => decision),
    );
  }

  return {
    decisions: query.data?.pages.flatMap((page) => page.decisions) ?? [],
    isLoading: query.isPending,
    error: query.error,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
    updateDecisionLocally,
    accessToken: token,
  };
}
