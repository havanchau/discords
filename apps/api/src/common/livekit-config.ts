import { ConfigService } from '@nestjs/config';

export type VoiceTransport = 'mesh' | 'livekit';

export interface LivekitConfig {
  transport: VoiceTransport;
  /** Server-to-server endpoint: token validation and `RoomServiceClient` calls. Unset in mesh mode. */
  url: string | null;
  /** Public-facing endpoint handed to the browser client for `livekit-client`'s `Room.connect()`. */
  wsUrl: string | null;
  apiKey: string | null;
  apiSecret: string | null;
}

/**
 * Called at startup: `VOICE_TRANSPORT` defaults to `mesh` so an environment with no LiveKit
 * credentials keeps working exactly as before (`voice-sfu.md`'s rollout-flag design). Only when the
 * flag is explicitly flipped to `livekit` are the LiveKit vars required — a half-configured
 * `livekit` transport must fail loudly at boot, not fail every `voice:join` at runtime.
 */
export function readLivekitConfig(config: ConfigService): LivekitConfig {
  const rawTransport = config.get<string>('VOICE_TRANSPORT') || 'mesh';
  if (rawTransport !== 'mesh' && rawTransport !== 'livekit') {
    throw new Error('VOICE_TRANSPORT must be "mesh" or "livekit"');
  }
  const transport: VoiceTransport = rawTransport;

  const url = config.get<string>('LIVEKIT_URL') || null;
  const wsUrl = config.get<string>('LIVEKIT_WS_URL') || null;
  const apiKey = config.get<string>('LIVEKIT_API_KEY') || null;
  const apiSecret = config.get<string>('LIVEKIT_API_SECRET') || null;

  if (transport === 'livekit' && (!url || !wsUrl || !apiKey || !apiSecret)) {
    throw new Error(
      'VOICE_TRANSPORT=livekit requires LIVEKIT_URL, LIVEKIT_WS_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET',
    );
  }

  return { transport, url, wsUrl, apiKey, apiSecret };
}
