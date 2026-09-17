import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_VOICE_MAX_BYTES,
  VOICE_ATTACHMENT_KIND,
  VOICE_MESSAGE_MAX_DURATION_MS,
  VOICE_WAVEFORM_MAX_BUCKETS,
  VOICE_WAVEFORM_MAX_PEAK,
  VOICE_WAVEFORM_MIN_BUCKETS,
  type MessageAttachment,
} from '@discord-clone/shared';
import type { MessageAttachmentInputDto } from './dto/create-message.dto';

/** The attachment columns shared by `MessageAttachment` and `DirectMessageAttachment`. */
export interface StoredAttachment {
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string;
  kind: string | null;
  durationMs: number | null;
  waveform: Prisma.JsonValue;
}

/** Called from service constructors, so a malformed value stops the boot instead of lifting the cap. */
export function readVoiceMaxBytes(config: ConfigService): number {
  const raw = config.get<string | number>('VOICE_MAX_BYTES');
  if (raw === undefined || raw === '') return DEFAULT_VOICE_MAX_BYTES;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('VOICE_MAX_BYTES must be an integer >= 1');
  }
  return value;
}

/**
 * Maps request attachments to create rows. The socket `message:create` path does not run the DTO
 * validation pipe, so voice metadata is re-checked here in full rather than trusted from decorators.
 * `durationMs` and `waveform` are stored only for a `kind: 'voice'` attachment; on any other file they
 * are dropped.
 */
export function toAttachmentCreateData(
  attachments: MessageAttachmentInputDto[],
  voiceMaxBytes: number,
) {
  return attachments.map((attachment) => {
    const row = {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      url: attachment.url,
    };
    if (attachment.kind === undefined || attachment.kind === null) return row;
    const voice = requireVoiceMetadata(attachment, voiceMaxBytes);
    return { ...row, ...voice };
  });
}

function requireVoiceMetadata(attachment: MessageAttachmentInputDto, voiceMaxBytes: number) {
  const { kind, durationMs, waveform, mimeType, byteSize } = attachment;
  if (
    kind !== VOICE_ATTACHMENT_KIND ||
    typeof mimeType !== 'string' ||
    !mimeType.startsWith('audio/') ||
    typeof durationMs !== 'number' ||
    !Number.isInteger(durationMs) ||
    durationMs < 1 ||
    !isValidWaveform(waveform)
  ) {
    throw new BadRequestException('Invalid voice message metadata');
  }
  if (durationMs > VOICE_MESSAGE_MAX_DURATION_MS) {
    throw new BadRequestException('Voice message is too long');
  }
  if (typeof byteSize !== 'number' || byteSize > voiceMaxBytes) {
    throw new BadRequestException('Voice message is too large');
  }
  return { kind, durationMs, waveform };
}

function isValidWaveform(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= VOICE_WAVEFORM_MIN_BUCKETS &&
    value.length <= VOICE_WAVEFORM_MAX_BUCKETS &&
    value.every(
      (peak) =>
        Number.isInteger(peak) && Number(peak) >= 0 && Number(peak) <= VOICE_WAVEFORM_MAX_PEAK,
    )
  );
}

/** Stored voice metadata, or null when the row is not a complete voice attachment. */
function readStoredVoice(attachment: StoredAttachment) {
  if (
    attachment.kind !== VOICE_ATTACHMENT_KIND ||
    attachment.durationMs === null ||
    !isValidWaveform(attachment.waveform)
  ) {
    return null;
  }
  return {
    kind: VOICE_ATTACHMENT_KIND,
    durationMs: attachment.durationMs,
    waveform: attachment.waveform,
  } as const;
}

export function formatAttachment(attachment: StoredAttachment & { id: string }): MessageAttachment {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    url: attachment.url,
    ...(readStoredVoice(attachment) ?? { kind: null, durationMs: null, waveform: null }),
  };
}

/** Turns a stored attachment back into send input, keeping voice metadata (used by forwarding). */
export function toAttachmentInput(attachment: StoredAttachment): MessageAttachmentInputDto {
  return {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    url: attachment.url,
    ...readStoredVoice(attachment),
  };
}

export const storedAttachmentSelect = {
  fileName: true,
  mimeType: true,
  byteSize: true,
  url: true,
  kind: true,
  durationMs: true,
  waveform: true,
} as const;
