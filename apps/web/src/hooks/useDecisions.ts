import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RealtimeEvents } from '@discord-clone/shared';
import type { DecisionStatus } from '@discord-clone/shared';
import {
  apiRequest,
  CreateDecisionInput,
  DecisionDetailResult,
  DecisionListResult,
  DecisionView,
  PollUpdatedPayload,
  uploadMessageAttachments,
} from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';
import { patchDecisionInPages, patchDecisionPollInPages } from '@/utils/decisions';

export interface NewDecision {
  title: string;
  content: string;
  files: File[];
  votingDeadlineAt: string;
  quorumCount?: number;
}

/**
 * A DECISION channel's proposals, most recently created first. Mirrors `useForumPosts`: realtime
 * events invalidate the list, and another member's vote arrives as `poll:updated` (the same event
 * the channel message list already consumes) and patches the matching decision's poll counts.
 */
export function useDecisions(channelId: string, status: DecisionStatus | null) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const listKey = queryKeys.decisionsChannel(channelId, status);

  const query = useInfiniteQuery({
    queryKey: listKey,
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (status) params.set('status', status);
      const search = params.toString();
      return apiRequest<DecisionListResult>(
        `/channels/${channelId}/decisions${search ? `?${search}` : ''}`,
        {},
        token,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  useEffect(() => {
    if (!socket) return;
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.decisionsChannelOf(channelId) });
    const handleCreated = (payload: DecisionDetailResult) => {
      if (payload.decision.channelId === channelId) refresh();
    };
    const handleUpdated = (payload: DecisionView) => {
      if (payload.channelId === channelId) refresh();
    };
    const handlePollUpdated = (payload: PollUpdatedPayload) => {
      if (payload.channelId !== channelId) return;
      queryClient.setQueriesData(
        { queryKey: queryKeys.decisionsChannelOf(channelId) },
        (data: Parameters<typeof patchDecisionPollInPages>[0]) =>
          patchDecisionPollInPages(data, payload),
      );
    };
    socket.on(RealtimeEvents.DecisionCreated, handleCreated);
    socket.on(RealtimeEvents.DecisionUpdated, handleUpdated);
    socket.on(RealtimeEvents.PollUpdated, handlePollUpdated);
    return () => {
      socket.off(RealtimeEvents.DecisionCreated, handleCreated);
      socket.off(RealtimeEvents.DecisionUpdated, handleUpdated);
      socket.off(RealtimeEvents.PollUpdated, handlePollUpdated);
    };
  }, [channelId, queryClient, socket]);

  const createMutation = useMutation({
    mutationFn: async (input: NewDecision) => {
      if (!token) throw new Error('Not signed in');
      const attachments = await uploadMessageAttachments(input.files, token);
      const body: CreateDecisionInput = {
        title: input.title,
        content: input.content,
        attachments,
        votingDeadlineAt: input.votingDeadlineAt,
        quorumCount: input.quorumCount,
      };
      return apiRequest<DecisionDetailResult>(
        `/channels/${channelId}/decisions`,
        { method: 'POST', body: JSON.stringify(body) },
        token,
      );
    },
    onSuccess: () => refreshList(),
  });

  function refreshList() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.decisionsChannelOf(channelId) });
  }

  /** Patches the calling member's own decision in place, the same instant-echo `usePollVoting` gives a vote. */
  function updateDecisionLocally(decision: DecisionView) {
    queryClient.setQueriesData(
      { queryKey: queryKeys.decisionsChannelOf(channelId) },
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
    createDecision: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateDecisionLocally,
    accessToken: token,
  };
}
