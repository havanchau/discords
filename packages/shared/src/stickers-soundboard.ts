/** Limits for server stickers and soundboard clips, shared so the settings UI and the API agree. */
export const STICKER_ATTACHMENT_KIND = 'sticker';
export const MAX_STICKERS_PER_SERVER = 30;
export const MAX_SOUNDBOARD_CLIPS_PER_SERVER = 30;
/** Same rule as custom emoji names. */
export const SERVER_ASSET_NAME_PATTERN = '^[a-zA-Z0-9_]{2,32}$';

export const STICKER_MAX_BYTES = 512 * 1024;
export const STICKER_MIME_TYPES = ['image/png', 'image/webp'] as const;

export const SOUNDBOARD_CLIP_MAX_BYTES = 512 * 1024;
export const SOUNDBOARD_CLIP_MAX_DURATION_MS = 5_000;
export const SOUNDBOARD_CLIP_MIME_TYPES = [
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/mp4',
] as const;

/** Per-user budget for `soundboard:play`, counted in Redis. */
export const SOUNDBOARD_PLAY_LIMIT = 10;
export const SOUNDBOARD_PLAY_WINDOW_MS = 60_000;

export interface ServerSticker {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  creatorId: string;
  createdAt: Date;
}

export interface SoundboardClip {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  durationMs: number;
  creatorId: string;
  createdAt: Date;
}

/** The live sticker behind a sticker attachment; null once that sticker was deleted. */
export interface MessageStickerRef {
  id: string;
  name: string;
}

/** Client command: only ids travel up; the server resolves the clip and its url. */
export interface SoundboardPlayPayload {
  channelId: string;
  clipId: string;
}

/** Broadcast to `call:<channelId>`. */
export interface SoundboardPlayedPayload {
  channelId: string;
  clipId: string;
  name: string;
  url: string;
  triggeredBy: { id: string; displayName: string };
}
