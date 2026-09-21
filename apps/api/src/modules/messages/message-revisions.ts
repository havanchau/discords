import { Prisma } from '@prisma/client';
import { MESSAGE_REVISION_LIMIT, type MessageRevisionView } from '@discord-clone/shared';
import type { PrismaService } from '@/modules/prisma/prisma.service';

const revisionSelect = { id: true, content: true, editedAt: true } as const;

/**
 * Keeps the content an edit is replacing, then drops whatever is older than the newest
 * `MESSAGE_REVISION_LIMIT` rows, so repeated edits cannot grow one message's history without bound.
 * Runs inside the edit's transaction, so the revision and the new content commit together.
 */
export async function recordMessageRevision(
  tx: Prisma.TransactionClient,
  messageId: string,
  replacedContent: string,
  editedAt: Date,
) {
  await tx.messageRevision.create({ data: { messageId, content: replacedContent, editedAt } });
  const overflow = await tx.messageRevision.findMany({
    where: { messageId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: MESSAGE_REVISION_LIMIT,
    select: { id: true },
  });
  if (overflow.length) {
    await tx.messageRevision.deleteMany({ where: { id: { in: overflow.map((row) => row.id) } } });
  }
}

/** Oldest first. `canViewContent` false redacts every revision, as the report queue does. */
export async function listMessageRevisions(
  prisma: PrismaService,
  messageId: string,
  canViewContent: boolean,
): Promise<MessageRevisionView[]> {
  // Newest `MESSAGE_REVISION_LIMIT`, so a cap overshoot from two concurrent edits never hides the
  // latest one; reversed to oldest first for the reader.
  const newestFirst = await prisma.messageRevision.findMany({
    where: { messageId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MESSAGE_REVISION_LIMIT,
    select: revisionSelect,
  });
  return newestFirst.reverse().map((revision) => ({
    id: revision.id,
    content: canViewContent ? revision.content : '',
    editedAt: revision.editedAt,
    contentHidden: !canViewContent,
  }));
}
