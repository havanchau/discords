import type { PrismaService } from '@/modules/prisma/prisma.service';
import type { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';

/**
 * Writes `ServerMember.timeoutUntil` and tells the server's members, so a manual timeout and an
 * AutoMod timeout reach the composer and `requireNotTimedOut` the same way. Callers authorize and
 * audit; a null `timeoutUntil` clears the timeout.
 */
export async function setMemberTimeout(
  prisma: PrismaService,
  realtime: RealtimePublisher,
  serverId: string,
  memberId: string,
  timeoutUntil: Date | null,
) {
  const member = await prisma.serverMember.update({
    where: { id: memberId },
    data: { timeoutUntil },
    select: { id: true, userId: true, timeoutUntil: true },
  });
  realtime.emitToRoom(realtime.serverRoom(serverId), 'server:member-updated', {
    serverId,
    memberId: member.id,
    userId: member.userId,
    timeoutUntil: member.timeoutUntil,
  });
  return member;
}
