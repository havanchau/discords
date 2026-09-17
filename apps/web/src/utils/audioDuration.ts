/**
 * Decodes an audio file to read its real duration, for the soundboard's client-side length cap. The API
 * cannot decode audio, so this is the only duration check; resolves null for a file the browser cannot
 * decode.
 */
export async function measureAudioDurationMs(file: Blob): Promise<number | null> {
  try {
    // The offline context only decodes; its own length and sample rate are irrelevant here.
    const context = new OfflineAudioContext(1, 1, 44_100);
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    return Math.max(1, Math.round(buffer.duration * 1000));
  } catch {
    // An undecodable file is reported to the uploader as unreadable, not uploaded with a guessed length.
    return null;
  }
}
