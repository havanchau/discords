import { Prisma } from '@prisma/client';

/**
 * The `include` every thread-summary read shares, plus its inferred payload type. Extracted from
 * `messages.service.ts` to keep that file under the 1000-line cap (`AGENTS.md` §2); no behavior
 * change — the shape is byte-for-byte what the service declared inline.
 */
export const threadSummaryInclude = {
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  participants: {
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  },
  tags: { select: { tag: { select: { id: true, name: true, position: true } } } },
  _count: { select: { messages: true } },
} satisfies Prisma.ThreadInclude;

export type ThreadWithSummary = Prisma.ThreadGetPayload<{ include: typeof threadSummaryInclude }>;

export function errorStack(error: unknown) {
  return error instanceof Error ? error.stack : String(error);
}
