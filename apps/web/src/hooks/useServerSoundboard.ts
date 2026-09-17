import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, postMultipart, type SoundboardClip } from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noClips: SoundboardClip[] = [];

/**
 * A server's soundboard clips, for the call panel and the settings section. Refetched when anyone adds
 * or removes one (`server:soundboard-updated`), like custom emoji.
 */
export function useServerSoundboard(serverId: string | null) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.serverSoundboard(serverId ?? 'none');

  const query = useQuery({
    queryKey,
    enabled: Boolean(token && serverId),
    queryFn: () =>
      apiRequest<{ clips: SoundboardClip[] }>(`/servers/${serverId}/soundboard`, {}, token),
  });

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.serverSoundboard(payload.serverId),
      });
    };
    socket.on(RealtimeEvents.ServerSoundboardUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerSoundboardUpdated, handleUpdated);
    };
  }, [socket, queryClient]);

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: ({ file, name, durationMs }: { file: File; name: string; durationMs: number }) => {
      if (!token) throw new Error('Not signed in');
      const form = new FormData();
      form.append('name', name);
      // Measured in the browser; the API can only range-check it.
      form.append('durationMs', String(durationMs));
      form.append('file', file);
      return postMultipart<{ clip: SoundboardClip }>(
        `/servers/${serverId}/soundboard`,
        form,
        token,
      );
    },
    onSettled: refetch,
  });

  const deleteMutation = useMutation({
    mutationFn: (clipId: string) =>
      apiRequest<{ ok: true }>(
        `/servers/${serverId}/soundboard/${clipId}`,
        { method: 'DELETE' },
        token,
      ),
    onSettled: refetch,
  });

  return {
    clips: query.data?.clips ?? noClips,
    isLoading: query.isPending && Boolean(token && serverId),
    error: query.error,
    createClip: createMutation.mutateAsync,
    deleteClip: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    pendingDeleteId: deleteMutation.isPending ? deleteMutation.variables : undefined,
  };
}
