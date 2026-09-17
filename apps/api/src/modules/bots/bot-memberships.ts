import type { Prisma } from '@prisma/client';

/**
 * Deletes a bot: its memberships first (MemberRole and member overrides cascade), one `BOT_REMOVE`
 * audit row per server it left, then the Bot row, which revokes the token. The bot's User row stays so
 * its messages keep their author. Runs inside the caller's transaction; returns the servers it left so
 * the caller can announce the removal after commit.
 *
 * Shared by `BotsService.remove` and account anonymization, which deletes every bot the account owns.
 */
export async function deleteBotWithMemberships(
  tx: Prisma.TransactionClient,
  bot: { id: string; name: string; botUserId: string },
  actorId: string,
) {
  const memberships = await tx.serverMember.findMany({
    where: { userId: bot.botUserId },
    select: { serverId: true },
  });
  const serverIds = memberships.map((membership) => membership.serverId);
  await tx.serverMember.deleteMany({ where: { userId: bot.botUserId } });
  if (serverIds.length) {
    await tx.auditLog.createMany({
      data: serverIds.map((serverId) => ({
        serverId,
        actorId,
        action: 'BOT_REMOVE',
        targetId: bot.id,
        metadata: { botId: bot.id, botName: bot.name },
      })),
    });
  }
  await tx.bot.delete({ where: { id: bot.id } });
  return serverIds;
}
