import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';

/**
 * Keeps a bot's gateway socket in sync with a membership removal, from any path that removes one
 * (this module's own remove-from-server, a kick/ban through `ServerModerationService`, bot/owner
 * deletion): the bot's live socket, if any, is taken out of the removed server's rooms, or fully
 * disconnected if it has no other server left (`bot-gateway-and-slash-commands.md` → Changes →
 * Gateway → Disconnect). A no-op for a human `removedUserId` — `bot` lookup simply misses.
 */
export async function syncBotGatewayOnRemoval(
  prisma: PrismaService,
  realtime: RealtimePublisher,
  removedUserId: string,
  serverId: string,
) {
  const bot = await prisma.bot.findUnique({
    where: { botUserId: removedUserId },
    select: { id: true },
  });
  if (!bot) return;

  const remaining = await prisma.serverMember.count({ where: { userId: removedUserId } });
  if (remaining === 0) {
    realtime.disconnectBotSocket(bot.id);
    return;
  }

  const channels = await prisma.channel.findMany({ where: { serverId }, select: { id: true } });
  realtime.removeBotFromRooms(bot.id, [
    realtime.serverRoom(serverId),
    ...channels.map((channel) => realtime.channelRoom(channel.id)),
  ]);
}
