import {
  VOICE_ATTACHMENT_KIND,
  VOICE_MESSAGE_MAX_DURATION_MS,
  VOICE_WAVEFORM_MAX_PEAK,
  type VoiceAttachmentMetadata,
} from '@discord-clone/shared';

/** Within the API's 20-100 bucket range; enough bars to read at the player's width. */
const WAVEFORM_BUCKETS = 48;

/**
 * Decodes a finished recording to measure its real duration and peak waveform. Resolves null when the
 * browser cannot decode its own recording, in which case the file is sent as a plain audio attachment
 * rather than with made-up metadata.
 */
export async function analyzeVoiceRecording(blob: Blob): Promise<VoiceAttachmentMetadata | null> {
  let buffer: AudioBuffer;
  try {
    // The offline context only decodes; its own length and sample rate are irrelevant here.
    const context = new OfflineAudioContext(1, 1, 44_100);
    buffer = await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    // Decoding support for MediaRecorder output varies by browser; falling back to a plain audio file
    // keeps the recording sendable, and the generic player needs no metadata.
    return null;
  }

  const durationMs = Math.min(
    VOICE_MESSAGE_MAX_DURATION_MS,
    Math.max(1, Math.round(buffer.duration * 1000)),
  );
  return { kind: VOICE_ATTACHMENT_KIND, durationMs, waveform: peakBuckets(buffer) };
}

function peakBuckets(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(samples.length / WAVEFORM_BUCKETS));
  const peaks = Array.from({ length: WAVEFORM_BUCKETS }, (_, bucket) => {
    const start = bucket * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    return peak;
  });
  const loudest = Math.max(...peaks);
  return peaks.map((peak) =>
    loudest > 0 ? Math.round((peak / loudest) * VOICE_WAVEFORM_MAX_PEAK) : 0,
  );
}

/** `m:ss` for a voice-message duration or playback position. */
export function formatVoiceDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
