/**
 * Content sniffing for small server assets (stickers, soundboard clips). The declared MIME type and
 * file name come from the client, so the stored type is decided from the leading bytes instead.
 * This proves the container format only; it does not decode the image or the audio.
 */

function startsWith(buffer: Buffer, bytes: number[], offset = 0) {
  return buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);
}

function asciiAt(buffer: Buffer, text: string, offset: number) {
  return startsWith(
    buffer,
    [...text].map((char) => char.charCodeAt(0)),
    offset,
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];

/** File extension the storage layer should use for each sniffed type. */
export const SNIFFED_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
};

/** `image/png` or `image/webp`, or null for anything else (including GIF and JPEG). */
export function sniffStickerImageType(buffer: Buffer): 'image/png' | 'image/webp' | null {
  if (startsWith(buffer, PNG_SIGNATURE)) return 'image/png';
  if (asciiAt(buffer, 'RIFF', 0) && asciiAt(buffer, 'WEBP', 8)) return 'image/webp';
  return null;
}

/** One of the soundboard audio types, or null. */
export function sniffSoundboardAudioType(buffer: Buffer) {
  if (asciiAt(buffer, 'ID3', 0)) return 'audio/mpeg';
  // An MPEG audio frame without an ID3 tag starts with an 11-bit frame sync.
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (asciiAt(buffer, 'OggS', 0)) return 'audio/ogg';
  if (asciiAt(buffer, 'RIFF', 0) && asciiAt(buffer, 'WAVE', 8)) return 'audio/wav';
  if (startsWith(buffer, EBML_SIGNATURE)) return 'audio/webm';
  if (asciiAt(buffer, 'ftyp', 4)) return 'audio/mp4';
  return null;
}
