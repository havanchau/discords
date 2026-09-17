import type { PollStatus } from '@discord-clone/shared';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const POLL_QUESTION_MAX_LENGTH = 300;
export const POLL_OPTION_MAX_LENGTH = 80;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;
const MIN_EXPIRY_MS = 5 * MINUTE_MS;
const MAX_EXPIRY_MS = 7 * DAY_MS;
/** A client that picks exactly "5 minutes" reaches the API a moment later; do not reject it. */
const EXPIRY_GRACE_MS = MINUTE_MS;

/** Computed, like server event status, so an expired poll is closed without any scheduler. */
export function pollStatus(
  poll: { expiresAt: Date | null; closedAt: Date | null },
  now: Date,
): PollStatus {
  if (poll.closedAt) return 'CLOSED';
  if (poll.expiresAt && now >= poll.expiresAt) return 'CLOSED';
  return 'OPEN';
}

/** Returns a validation message, or null when the expiry is acceptable. */
export function validatePollExpiry(expiresAt: Date, now: Date): string | null {
  const lead = expiresAt.getTime() - now.getTime();
  if (Number.isNaN(lead) || lead < MIN_EXPIRY_MS - EXPIRY_GRACE_MS || lead > MAX_EXPIRY_MS) {
    return 'Poll expiry must be between 5 minutes and 7 days from now';
  }
  return null;
}

/** Trims the question and options; returns a validation message instead when they are unusable. */
export function normalizePollText(
  question: string,
  options: string[],
): { question: string; options: string[] } | { error: string } {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) return { error: 'Poll question cannot be empty' };
  const trimmedOptions = options.map((option) => option.trim());
  if (trimmedOptions.some((option) => !option)) return { error: 'Poll options cannot be empty' };
  const distinct = new Set(trimmedOptions.map((option) => option.toLowerCase()));
  if (distinct.size !== trimmedOptions.length) return { error: 'Poll options must be unique' };
  return { question: trimmedQuestion, options: trimmedOptions };
}
