import type { CreatePollInput, Poll, PollUpdatedPayload } from '@/api';
import type { MessageKey } from '@/i18n/LocaleProvider';

const MAX_POLL_OPTIONS = 10;
const EXPIRY_UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 60 * 60_000,
  d: 24 * 60 * 60_000,
};
const EXPIRY_FLAG = /^--expires=(\d+)([mhd])$/;

export type PollCommandResult =
  | { input: CreatePollInput }
  | { errorKey: MessageKey; errorVars?: Record<string, string> };

/**
 * `/poll Question | Option A | Option B`, with optional `--multiple`, `--show-voters` and
 * `--expires=<number><m|h|d>` segments anywhere after the command. The API owns the real limits.
 */
export function parsePollCommand(args: string, now: number): PollCommandResult {
  const parts = args
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const input: CreatePollInput = { question: '', options: [] };

  for (const flag of parts.filter((part) => part.startsWith('--'))) {
    const expiry = EXPIRY_FLAG.exec(flag);
    if (flag === '--multiple') input.allowMultiple = true;
    else if (flag === '--show-voters') input.showVoters = true;
    else if (expiry) {
      input.expiresAt = new Date(now + Number(expiry[1]) * EXPIRY_UNIT_MS[expiry[2]]).toISOString();
    } else return { errorKey: 'poll.error.unknownFlag', errorVars: { flag } };
  }

  const [question, ...options] = parts.filter((part) => !part.startsWith('--'));
  if (!question || options.length < 2) return { errorKey: 'poll.error.usage' };
  if (options.length > MAX_POLL_OPTIONS) return { errorKey: 'poll.error.tooManyOptions' };
  return { input: { ...input, question, options } };
}

/** Expiry is enforced by the API; this only keeps the card from offering a vote it would refuse. */
export function isPollClosed(poll: Poll, now: number) {
  return (
    poll.status === 'CLOSED' ||
    (poll.expiresAt !== null && new Date(poll.expiresAt).getTime() <= now)
  );
}

export function totalVotes(poll: Poll) {
  return poll.options.reduce((sum, option) => sum + option.voteCount, 0);
}

/** What the card shows between clicking and the API answering. */
export function withOptimisticVote(poll: Poll, optionIds: string[]): Poll {
  return {
    ...poll,
    votedOptionIds: optionIds,
    options: poll.options.map((option) => {
      const wasVoted = poll.votedOptionIds.includes(option.id);
      const isVoted = optionIds.includes(option.id);
      return { ...option, voteCount: option.voteCount - Number(wasVoted) + Number(isVoted) };
    }),
  };
}

/** A `poll:updated` event carries counts and status only; the viewer's own selection is kept. */
export function applyPollCounts(poll: Poll, payload: PollUpdatedPayload): Poll {
  const counts = new Map(payload.options.map((option) => [option.id, option.voteCount]));
  return {
    ...poll,
    status: payload.status,
    closedAt: payload.closedAt,
    options: poll.options.map((option) => ({
      ...option,
      voteCount: counts.get(option.id) ?? option.voteCount,
    })),
  };
}

type WithPoll = { poll?: Poll | null };

/**
 * Broadcast message payloads carry an empty `votedOptionIds` (they go to many users), so replacing a
 * message from one must not wipe the selection this client already knows.
 */
export function keepViewerPollState<T extends WithPoll>(previous: T, next: T): T {
  if (!previous.poll || !next.poll || previous.poll.id !== next.poll.id) return next;
  return { ...next, poll: { ...next.poll, votedOptionIds: previous.poll.votedOptionIds } };
}

/** Returns the same array when no message holds this poll, so unrelated lists do not re-render. */
export function updatePollInMessages<T extends WithPoll>(
  messages: T[],
  pollId: string,
  update: (poll: Poll) => Poll,
): T[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.poll?.id !== pollId) return message;
    changed = true;
    return { ...message, poll: update(message.poll) };
  });
  return changed ? next : messages;
}
