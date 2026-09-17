import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, postMultipart, type ServerSticker } from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noStickers: ServerSticker[] = [];

/**
 * A server's stickers, for the composer picker and the settings section. Refetched when anyone adds or
 * removes one (`server:stickers-updated`), like custom emoji.
 */
export function useServerStickers(serverId: string | null) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.serverStickers(serverId ?? 'none');

  const query = useQuery({
    queryKey,
    enabled: Boolean(token && serverId),
    queryFn: () =>
      apiRequest<{ stickers: ServerSticker[] }>(`/servers/${serverId}/stickers`, {}, token),
  });

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverStickers(payload.serverId) });
    };
    socket.on(RealtimeEvents.ServerStickersUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerStickersUpdated, handleUpdated);
    };
  }, [socket, queryClient]);

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => {
      if (!token) throw new Error('Not signed in');
      const form = new FormData();
      form.append('name', name);
      form.append('file', file);
      return postMultipart<{ sticker: ServerSticker }>(
        `/servers/${serverId}/stickers`,
        form,
        token,
      );
    },
    onSettled: refetch,
  });

  const deleteMutation = useMutation({
    mutationFn: (stickerId: string) =>
      apiRequest<{ ok: true }>(
        `/servers/${serverId}/stickers/${stickerId}`,
        { method: 'DELETE' },
        token,
      ),
    onSettled: refetch,
  });

  return {
    stickers: query.data?.stickers ?? noStickers,
    isLoading: query.isPending && Boolean(token && serverId),
    error: query.error,
    createSticker: createMutation.mutateAsync,
    deleteSticker: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    pendingDeleteId: deleteMutation.isPending ? deleteMutation.variables : undefined,
  };
}
