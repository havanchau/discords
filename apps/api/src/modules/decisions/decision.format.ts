import { Prisma } from '@prisma/client';
import type { DecisionView } from '@discord-clone/shared';
import { formatPoll, pollInclude } from '@/modules/polls/poll.format';

export const decisionInclude = {
  channel: { select: { name: true } },
  thread: {
    select: {
      title: true,
      rootMessageId: true,
      rootMessage: { select: { poll: { include: pollInclude } } },
    },
  },
  proposer: { select: { id: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.DecisionInclude;

export type DecisionWithDetails = Prisma.DecisionGetPayload<{ include: typeof decisionInclude }>;

/**
 * The vote *is* the underlying Poll's — reached through `thread.rootMessage.poll`, never a
 * duplicated reference (docs/features/decision-channels.md → DB / migration: "No pollId column").
 * A decision whose root message was hard-deleted (never happens today, cascades take the row with
 * it) has no poll to format; that case throws, since a formattable decision always has one.
 */
export function formatDecision(
  decision: DecisionWithDetails,
  viewerId: string | null,
): DecisionView {
  const poll = decision.thread.rootMessage.poll;
  if (!poll) {
    throw new Error(`Decision ${decision.id} has no poll on its root message`);
  }
  return {
    id: decision.id,
    channelId: decision.channelId,
    channelName: decision.channel.name,
    threadId: decision.threadId,
    title: decision.thread.title ?? '',
    status: decision.status,
    votingDeadlineAt: decision.votingDeadlineAt,
    quorumCount: decision.quorumCount,
    expiredAt: decision.expiredAt,
    decidedAt: decision.decidedAt,
    decidedById: decision.decidedById,
    supersededByDecisionId: decision.supersededByDecisionId,
    poll: formatPoll(poll, viewerId),
    proposer: decision.proposer,
  };
}
