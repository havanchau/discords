/** Limits for recorded voice messages, shared so the recorder and the API enforce the same numbers. */
export const VOICE_ATTACHMENT_KIND = 'voice';
export const VOICE_MESSAGE_MAX_DURATION_MS = 300_000;
export const VOICE_WAVEFORM_MIN_BUCKETS = 20;
export const VOICE_WAVEFORM_MAX_BUCKETS = 100;
export const VOICE_WAVEFORM_MAX_PEAK = 100;
/** Default for the API's `VOICE_MAX_BYTES`, checked in addition to `UPLOAD_MAX_BYTES`. */
export const DEFAULT_VOICE_MAX_BYTES = 25 * 1024 * 1024;

/** Metadata the composer attaches to an uploaded recording. */
export interface VoiceAttachmentMetadata {
  kind: typeof VOICE_ATTACHMENT_KIND;
  durationMs: number;
  /** Normalized peak amplitude per bucket, 0-100. */
  waveform: number[];
}
