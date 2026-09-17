import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import { assetUrl, type SoundboardPlayedPayload } from '@/api';
import { directCallId } from './useDirectCall';

const DM_CALL_PREFIX = directCallId('');

/** How long the "X played Y" line stays in the call header. */
const PLAYED_INDICATOR_MS = 4_000;

/**
 * Soundboard for the call this client is in. There is no SFU, so a clip is not mixed into the call:
 * every participant's own client plays the broadcast url locally, including the one who triggered it.
 * Mounted once in the app shell (outside the socket context) so a participant hears clips whether or
 * not the call panel is on screen. `callId` is the current call's id; DM calls have no soundboard.
 */
export function useSoundboardPlayback(socket: Socket | null, callId: string | null) {
  const callChannelId = callId && !callId.startsWith(DM_CALL_PREFIX) ? callId : null;
  const [lastPlayed, setLastPlayed] = useState<SoundboardPlayedPayload | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  useEffect(() => {
    if (!socket || !callChannelId) return;
    const handlePlayed = (payload: SoundboardPlayedPayload) => {
      if (payload.channelId !== callChannelId) return;
      setLastPlayed(payload);
      new Audio(assetUrl(payload.url)).play().then(
        () => setPlaybackFailed(false),
        // Rejected when the browser blocks autoplay or cannot decode the file; the header says so.
        () => setPlaybackFailed(true),
      );
    };
    socket.on(RealtimeEvents.SoundboardPlayed, handlePlayed);
    return () => {
      socket.off(RealtimeEvents.SoundboardPlayed, handlePlayed);
    };
  }, [socket, callChannelId]);

  useEffect(() => {
    if (!lastPlayed) return;
    const timer = window.setTimeout(() => setLastPlayed(null), PLAYED_INDICATOR_MS);
    return () => window.clearTimeout(timer);
  }, [lastPlayed]);

  /**
   * Resolves to null on success, or the server's refusal (rate limit, not a participant, clip deleted).
   * An empty string means no reason came back (offline, timeout); the caller shows its fallback copy.
   */
  const play = useCallback(
    (clipId: string) =>
      new Promise<string | null>((resolve) => {
        if (!socket?.connected || !callChannelId) {
          resolve('');
          return;
        }
        socket
          .timeout(5000)
          .emit(
            RealtimeEvents.SoundboardPlay,
            { channelId: callChannelId, clipId },
            (err: Error | null, result?: { ok?: true; error?: string }) => {
              if (err) resolve('');
              else resolve(result?.error ?? null);
            },
          );
      }),
    [socket, callChannelId],
  );

  return { lastPlayed, playbackFailed, play };
}

export type SoundboardPlayback = ReturnType<typeof useSoundboardPlayback>;
