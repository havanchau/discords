import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RealtimeEvents, type StageRosterView } from '@discord-clone/shared';
import { apiRequest } from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/**
 * A STAGE channel's speakers and speak requests, kept live by the `stage:*` events, which reach the
 * call's participants and everyone with the channel open.
 */
export function useStageRoster(channelId: string | null) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.stageRoster(channelId ?? 'none');

  const query = useQuery({
    queryKey,
    enabled: Boolean(token && channelId),
    queryFn: () => apiRequest<StageRosterView>(`/channels/${channelId}/stage`, {}, token),
  });

  useEffect(() => {
    if (!socket) return;
    const handleChanged = (payload: { channelId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stageRoster(payload.channelId) });
    };
    socket.on(RealtimeEvents.StageRoleChanged, handleChanged);
    socket.on(RealtimeEvents.StageSpeakRequestUpdated, handleChanged);
    return () => {
      socket.off(RealtimeEvents.StageRoleChanged, handleChanged);
      socket.off(RealtimeEvents.StageSpeakRequestUpdated, handleChanged);
    };
  }, [socket, queryClient]);

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const requestMutation = useMutation({
    mutationFn: (requested: boolean) =>
      apiRequest<{ ok: true }>(
        `/channels/${channelId}/stage/request-to-speak`,
        { method: requested ? 'POST' : 'DELETE' },
        token,
      ),
    onSettled: refetch,
  });

  const speakerMutation = useMutation({
    mutationFn: ({ userId, isSpeaker }: { userId: string; isSpeaker: boolean }) =>
      isSpeaker
        ? apiRequest<{ ok: true }>(
            `/channels/${channelId}/stage/speakers`,
            { method: 'POST', body: JSON.stringify({ userId }) },
            token,
          )
        : apiRequest<{ ok: true }>(
            `/channels/${channelId}/stage/speakers/${userId}`,
            { method: 'DELETE' },
            token,
          ),
    onSettled: refetch,
  });

  return {
    roster: query.data ?? null,
    isLoading: query.isPending && Boolean(channelId),
    error: query.error,
    setRequested: requestMutation.mutateAsync,
    setSpeaker: speakerMutation.mutateAsync,
    isUpdating: requestMutation.isPending || speakerMutation.isPending,
  };
}
