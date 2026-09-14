import { Prisma, PrismaClient } from '@prisma/client';

type UnreadRow = { id: string; count: number };

/*
 * The "newer than this user's lastReadAt" cutoff differs per channel/conversation, which Prisma's
 * groupBy cannot express, so one grouped raw query replaces a count per channel.
 * Channels/conversations with nothing unread are absent from the result.
 */
export async function countChannelUnread(
  prisma: PrismaClient,
  userId: string,
  channelIds: string[],
): Promise<Record<string, number>> {
  if (!channelIds.length) return {};

  const rows = await prisma.$queryRaw<UnreadRow[]>`
    SELECT m."channelId" AS "id", COUNT(*)::int AS "count"
    FROM "Message" m
    LEFT JOIN "ReadState" r ON r."channelId" = m."channelId" AND r."userId" = ${userId}
    WHERE m."channelId" IN (${Prisma.join(channelIds)})
      AND m."deletedAt" IS NULL
      AND m."authorId" <> ${userId}
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY m."channelId"
  `;
  return toCountMap(rows);
}

export async function countDirectUnread(
  prisma: PrismaClient,
  userId: string,
  conversationIds: string[],
): Promise<Record<string, number>> {
  if (!conversationIds.length) return {};

  const rows = await prisma.$queryRaw<UnreadRow[]>`
    SELECT m."conversationId" AS "id", COUNT(*)::int AS "count"
    FROM "DirectMessage" m
    LEFT JOIN "DirectReadState" r
      ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      AND m."authorId" <> ${userId}
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY m."conversationId"
  `;
  return toCountMap(rows);
}

function toCountMap(rows: UnreadRow[]) {
  return Object.fromEntries(rows.map((row) => [row.id, Number(row.count)]));
}
