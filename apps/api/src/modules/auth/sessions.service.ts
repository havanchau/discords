import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { AuthSessionEntry } from '@discord-clone/shared';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string, currentSessionId: string): Promise<{ sessions: AuthSessionEntry[] }> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, createdAt: true, lastActiveAt: true, expiresAt: true },
      orderBy: { lastActiveAt: 'desc' },
    });
    return {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === currentSessionId,
      })),
    };
  }

  async revoke(userId: string, currentSessionId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, revokedAt: true },
    });
    // Another user's session id gets the same 404 as a missing one.
    if (!session) throw new NotFoundException('Session not found');

    if (!session.revokedAt) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }
    await this.realtime.disconnectSessions(userId, [session.id]);
    return { ok: true, current: session.id === currentSessionId };
  }

  async revokeOthers(userId: string, currentSessionId: string) {
    const others = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      select: { id: true },
    });
    const otherIds = others.map((session) => session.id);
    if (otherIds.length) {
      await this.prisma.session.updateMany({
        where: { id: { in: otherIds } },
        data: { revokedAt: new Date() },
      });
    }
    await this.realtime.disconnectSessions(userId, otherIds);
    return { revoked: otherIds.length };
  }
}
