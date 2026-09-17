import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VOICE_ATTACHMENT_KIND, type ScheduledMessageFailureReason } from '@discord-clone/shared';
import type { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';
import { Permission } from '@/modules/permissions/channel-permission';
import { RULES_NOT_ACCEPTED_MESSAGE } from '@/modules/permissions/onboarding-gate';

const MINUTE_MS = 60_000;
const MIN_LEAD_MS = MINUTE_MS;
const MAX_LEAD_MS = 30 * 24 * 60 * MINUTE_MS;
/** A client that picks exactly "in 1 minute" reaches the API a moment later; do not reject it. */
const LEAD_GRACE_MS = 5_000;

/** How often each API instance looks for due scheduled messages. */
export const SCHEDULED_SWEEP_INTERVAL_MS = 15_000;
/** Upper bound on sends per tick, so one tick cannot run far into the next. */
export const SCHEDULED_SWEEP_BATCH = 50;
/** A claim older than this belongs to a process that stopped mid-send. */
export const SCHEDULED_STALE_CLAIM_MS = 2 * MINUTE_MS;
/** Also the list size, so every pending message of a destination is visible to its author. */
export const SCHEDULED_PENDING_LIMIT_PER_DESTINATION = 50;

export const SCHEDULED_MESSAGE_FAILURE_REASONS: readonly ScheduledMessageFailureReason[] = [
  'NO_ACCESS',
  'MISSING_PERMISSION',
  'TIMED_OUT',
  'SLOWMODE',
  'BLOCKED',
  'REPLY_TARGET_MISSING',
  'REJECTED',
  'INTERRUPTED',
  'AUTOMOD_BLOCKED',
  'ACCOUNT_DELETION',
  'RULES_NOT_ACCEPTED',
  'UNKNOWN',
];

/** Returns a validation message, or null when the send time is acceptable. */
export function validateSendAt(sendAt: Date, now: Date): string | null {
  const lead = sendAt.getTime() - now.getTime();
  if (Number.isNaN(lead) || lead < MIN_LEAD_MS - LEAD_GRACE_MS || lead > MAX_LEAD_MS) {
    return 'Scheduled time must be between 1 minute and 30 days from now';
  }
  return null;
}

export function isFailureReason(value: string | null): value is ScheduledMessageFailureReason {
  return SCHEDULED_MESSAGE_FAILURE_REASONS.some((reason) => reason === value);
}

/**
 * Maps a refusal from the send path to a stable code. The send methods throw English literals (the
 * same ones `error-codes.ts` keys on), so the mapping reads those literals in one place.
 */
export function failureReasonOf(error: unknown): ScheduledMessageFailureReason {
  if (!(error instanceof HttpException)) return 'UNKNOWN';
  const message = error.message;
  if (message.startsWith('You are timed out until ')) return 'TIMED_OUT';
  if (message.startsWith('Slowmode is enabled')) return 'SLOWMODE';
  if (message === `Missing permission: ${Permission.ViewChannel}`) return 'NO_ACCESS';
  if (message.startsWith('Missing permission: ')) return 'MISSING_PERMISSION';
  if (message === 'You cannot message this user') return 'BLOCKED';
  if (message === 'Reply target not found') return 'REPLY_TARGET_MISSING';
  if (message.startsWith('Message blocked by AutoMod: ')) return 'AUTOMOD_BLOCKED';
  if (message === RULES_NOT_ACCEPTED_MESSAGE) return 'RULES_NOT_ACCEPTED';
  if (
    message === 'Channel not found' ||
    message === 'Conversation not found' ||
    message === 'You are not a member of this server'
  ) {
    return 'NO_ACCESS';
  }
  return 'REJECTED';
}

/** Plain JSON for the `attachments` column; undefined optional fields are left out. */
export function toStoredAttachments(
  attachments: MessageAttachmentInputDto[],
): Prisma.InputJsonArray {
  return attachments.map((attachment) => ({
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    url: attachment.url,
    ...(attachment.kind ? { kind: attachment.kind } : {}),
    ...(attachment.durationMs !== undefined ? { durationMs: attachment.durationMs } : {}),
    ...(attachment.waveform ? { waveform: attachment.waveform } : {}),
  }));
}

/**
 * Reads the `attachments` column back as send input. It was validated by the DTO when written, and
 * the send path validates it again, so an entry that no longer has the expected shape is dropped
 * here rather than trusted.
 */
export function readStoredAttachments(value: Prisma.JsonValue): MessageAttachmentInputDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const { fileName, mimeType, byteSize, url, kind, durationMs, waveform } = item;
    if (
      typeof fileName !== 'string' ||
      typeof mimeType !== 'string' ||
      typeof byteSize !== 'number' ||
      typeof url !== 'string'
    ) {
      return [];
    }
    const peaks = Array.isArray(waveform)
      ? waveform.filter((peak): peak is number => typeof peak === 'number')
      : null;
    return [
      {
        fileName,
        mimeType,
        byteSize,
        url,
        ...(kind === VOICE_ATTACHMENT_KIND ? { kind } : {}),
        ...(typeof durationMs === 'number' ? { durationMs } : {}),
        ...(peaks && Array.isArray(waveform) && peaks.length === waveform.length
          ? { waveform: peaks }
          : {}),
      },
    ];
  });
}
