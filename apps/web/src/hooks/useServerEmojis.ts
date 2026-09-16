import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { apiRequest, AuthState, ServerEmoji, uploadFile } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

export const MAX_EMOJI_BYTES = 256 * 1024;
const EMOJI_MIME_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

interface UseServerEmojisOptions {
  auth: AuthState | null;
  socket: Socket | null;
  serverId: string | null;
}

/** The open server's custom emoji, refreshed when anyone adds or removes one. */
export function useServerEmojis({ auth, socket, serverId }: UseServerEmojisOptions) {
  const t = useTranslation();
  const [emojis, setEmojis] = useState<ServerEmoji[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverIdRef = useRef(serverId);
  const token = auth?.accessToken;

  const loadEmojis = useCallback(
    async (targetServerId: string) => {
      if (!token) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await apiRequest<{ emojis: ServerEmoji[] }>(
          `/servers/${targetServerId}/emojis`,
          {},
          token,
        );
        if (serverIdRef.current === targetServerId) setEmojis(result.emojis);
      } catch (err) {
        if (serverIdRef.current === targetServerId) {
          setError(err instanceof Error ? err.message : t('error.fallback.cannot-load-emoji'));
        }
      } finally {
        if (serverIdRef.current === targetServerId) setIsLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    serverIdRef.current = serverId;
    setEmojis([]);
    setError(null);
    setIsLoading(false);
    if (serverId) void loadEmojis(serverId);
  }, [serverId, loadEmojis]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdated = (payload: { serverId: string }) => {
      if (payload.serverId === serverIdRef.current) void loadEmojis(payload.serverId);
    };
    socket.on(RealtimeEvents.ServerEmojisUpdated, handleUpdated);
    return () => {
      socket.off(RealtimeEvents.ServerEmojisUpdated, handleUpdated);
    };
  }, [socket, loadEmojis]);

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
      const attachment = await uploadFile(file, token);
      const result = await apiRequest<{ emoji: ServerEmoji }>(
        `/servers/${serverId}/emojis`,
        { method: 'POST', body: JSON.stringify({ name, url: attachment.url }) },
        token,
      );
      setEmojis((current) =>
        [...current.filter((emoji) => emoji.id !== result.emoji.id), result.emoji].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
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
      await apiRequest(`/servers/${serverId}/emojis/${emojiId}`, { method: 'DELETE' }, token);
      setEmojis((current) => current.filter((emoji) => emoji.id !== emojiId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-delete-emoji'));
    }
  }

  return { emojis, isLoading, error, createEmoji, deleteEmoji };
}
