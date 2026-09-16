import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';

/**
 * Presence is derived from the sockets this process holds, so a user stays ONLINE while any tab or
 * device is still connected and only goes OFFLINE when the last one drops.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
    private readonly access: RealtimeAccessService,
  ) {}

  async socketConnected(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);

    // Only the first socket flips the user online; further tabs join an already-online user.
    if (sockets.size === 1) {
      await this.setStatus(userId, 'ONLINE');
    }
  }

  async socketDisconnected(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    sockets.delete(socketId);
    if (sockets.size > 0) return;

    this.userSockets.delete(userId);
    await this.setStatus(userId, 'OFFLINE');
  }

  /**
   * A crash or restart never runs the disconnect path, so anyone online at that moment would stay
   * ONLINE in the database forever. Presence lives in this process, so on boot nobody is connected.
   */
  async resetStalePresence() {
    try {
      const { count } = await this.prisma.user.updateMany({
        where: { status: 'ONLINE' },
        data: { status: 'OFFLINE' },
      });
      if (count > 0) {
        this.logger.log(`Reset ${count} stale ONLINE users on startup`);
      }
    } catch (error) {
      this.logger.error('Could not reset stale presence on startup', error);
    }
  }

  private async setStatus(userId: string, status: 'ONLINE' | 'OFFLINE') {
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    const serverIds = await this.access.listServerIds(userId);
    this.publisher.emitToRooms(
      serverIds.map((serverId) => this.publisher.serverRoom(serverId)),
      'presence:update',
      { userId, status },
    );
  }
}
