import { PrismaClient } from '@prisma/client';

/** A block in either direction between two users, or null. */
export function findBlockBetween(prisma: PrismaClient, userId: string, otherUserId: string) {
  return prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
}
