import { Prisma } from '@prisma/client';
import type { PollUpdatedPayload, PollView } from '@discord-clone/shared';
import { pollStatus } from './poll-status';

export const pollInclude = {
  options: {
    orderBy: { position: 'asc' as const },
    include: {
      votes: {
        select: {
          userId: true,
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} satisfies Prisma.PollInclude;

export type PollWithDetails = Prisma.PollGetPayload<{ include: typeof pollInclude }>;

/**
 * `viewerId` fills `votedOptionIds`; pass null for a payload that several users receive. Voter
 * identities leave the server only for polls created with `showVoters`.
 */
export function formatPoll(poll: PollWithDetails, viewerId: string | null, now = new Date()) {
  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    showVoters: poll.showVoters,
    expiresAt: poll.expiresAt,
    closedAt: poll.closedAt,
    status: pollStatus(poll, now),
    options: poll.options.map((option) => ({
      id: option.id,
      label: option.label,
      voteCount: option.votes.length,
      ...(poll.showVoters ? { voters: option.votes.map((vote) => vote.user) } : {}),
    })),
    votedOptionIds: viewerId
      ? poll.options
          .filter((option) => option.votes.some((vote) => vote.userId === viewerId))
          .map((option) => option.id)
      : [],
  } satisfies PollView;
}

export function pollUpdatedPayload(
  poll: PollWithDetails,
  destination: { channelId: string | null; conversationId: string | null },
  now = new Date(),
): PollUpdatedPayload {
  return {
    pollId: poll.id,
    channelId: destination.channelId,
    conversationId: destination.conversationId,
    status: pollStatus(poll, now),
    closedAt: poll.closedAt,
    options: poll.options.map((option) => ({ id: option.id, voteCount: option.votes.length })),
  };
}

/** A message formatted for one viewer carries that viewer's vote; strip it before a room broadcast. */
export function withoutViewerVotes<T extends { poll?: PollView | null }>(message: T): T {
  return message.poll ? { ...message, poll: { ...message.poll, votedOptionIds: [] } } : message;
}
