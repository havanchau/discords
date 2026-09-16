import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, AuthState, ServerEmoji, uploadFile } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';
import { queryKeys } from '../query/queryKeys';

export const MAX_EMOJI_BYTES = 256 * 1024;
const EMOJI_MIME_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

interface UseServerEmojisOptions {
  auth: AuthState | null;
  socket: Socket | null;
  serverId: string | null;
}

interface EmojisResult {
  emojis: ServerEmoji[];
}

const noEmojis: ServerEmoji[] = [];

function byName(a: ServerEmoji, b: ServerEmoji) {
  return a.name.localeCompare(b.name);
}

/** The open server's custom emoji, refreshed when anyone adds or removes one. */
export function useServerEmojis({ auth, socket, serverId }: UseServerEmojisOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.serverEmojis(serverId ?? 'none');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(token && serverId),
    queryFn: () => apiRequest<EmojisResult>(`/servers/${serverId}/emojis`, {}, token),
  });

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serverEmojis(payload.serverId) });
    };
    socket.on(RealtimeEvents.ServerEmojisUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerEmojisUpdated, handleUpdated);
    };
  }, [socket, queryClient]);

  const createMutation = useMutation({
    mutationFn: async ({ file, name }: { file: File; name: string }) => {
      const attachment = await uploadFile(file, token!);
      return apiRequest<{ emoji: ServerEmoji }>(
        `/servers/${serverId}/emojis`,
        { method: 'POST', body: JSON.stringify({ name, url: attachment.url }) },
        token,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (emojiId: string) =>
      apiRequest(`/servers/${serverId}/emojis/${emojiId}`, { method: 'DELETE' }, token),
  });

  async function createEmoji(file: File, name: string) {
    if (!token || !serverId) return false;
    if (!EMOJI_MIME_TYPES.includes(file.type)) {
      setError(t('emoji.error.type'));
      return false;
    }
    if (file.size > MAX_EMOJI_BYTES) {
      setError(t('emoji.error.size'));
      return false;
    }
    setError(null);
    try {
      const result = await createMutation.mutateAsync({ file, name });
      queryClient.setQueryData<EmojisResult>(queryKey, (current) => ({
        emojis: [
          ...(current?.emojis ?? []).filter((emoji) => emoji.id !== result.emoji.id),
          result.emoji,
        ].sort(byName),
      }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-add-emoji'));
      return false;
    }
  }

  async function deleteEmoji(emojiId: string) {
    if (!token || !serverId) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(emojiId);
      queryClient.setQueryData<EmojisResult>(queryKey, (current) =>
        current ? { emojis: current.emojis.filter((emoji) => emoji.id !== emojiId) } : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-delete-emoji'));
    }
  }

  return { emojis: data?.emojis ?? noEmojis, isLoading, error, createEmoji, deleteEmoji };
}
