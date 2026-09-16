import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimePublisher } from './realtime-publisher.service';

/**
 * Presence is derived from every socket the deployment holds, not just this process: the sockets of
 * one user live in a Redis sorted set scored by their last heartbeat, so a user stays ONLINE while
 * any tab on any instance is still connected.
 *
 * Scoring by heartbeat is what makes a crash safe. A killed instance never runs its disconnect
 * path, so its socket entries simply stop being refreshed and are pruned once they fall behind
 * `heartbeatTtlMs` — no instance-scoped cleanup and no blanket reset on boot.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly publisher: RealtimePublisher,
    private readonly access: RealtimeAccessService,
  ) {}

  async socketConnected(userId: string, socketId: string) {
    const now = Date.now();
    const userKey = this.userSocketsKey(userId);

    // Counted inside the transaction: reading the size afterwards would let two sockets connecting
    // at once both observe 2, and nobody would flip the user online.
    const replies = await this.redis.client
      .multi()
      .zadd(userKey, now, socketId)
      .zremrangebyscore(userKey, '-inf', this.staleBefore(now))
      .pexpire(userKey, this.redis.config.heartbeatTtlMs * 2)
      .zadd(this.onlineUsersKey(), now, userId)
      .zcard(userKey)
      .exec();

    // Only the first live socket of this user flips them online; further tabs join an online user.
    if (this.replyAt(replies, 4) === 1) {
      await this.setStatus(userId, 'ONLINE');
    }
  }

  async socketDisconnected(userId: string, socketId: string) {
    const userKey = this.userSocketsKey(userId);
    const replies = await this.redis.client
      .multi()
      .zrem(userKey, socketId)
      .zremrangebyscore(userKey, '-inf', this.staleBefore(Date.now()))
      .zcard(userKey)
      .exec();

    if (this.replyAt(replies, 2) !== 0) return;

    await this.redis.client.zrem(this.onlineUsersKey(), userId);
    await this.setStatus(userId, 'OFFLINE');
  }

  /** A transaction reply is `[error, value]`; a failed command must not be read as a count. */
  private replyAt(replies: [Error | null, unknown][] | null, index: number) {
    const reply = replies?.[index];
    if (!reply || reply[0]) return null;
    return typeof reply[1] === 'number' ? reply[1] : null;
  }

  /** Keeps this instance's own sockets from being pruned as if their instance had crashed. */
  async heartbeat(socketsByUserId: Map<string, string[]>) {
    if (!socketsByUserId.size) return;

    const now = Date.now();
    const pipeline = this.redis.client.pipeline();
    socketsByUserId.forEach((socketIds, userId) => {
      const userKey = this.userSocketsKey(userId);
      socketIds.forEach((socketId) => pipeline.zadd(userKey, now, socketId));
      pipeline.pexpire(userKey, this.redis.config.heartbeatTtlMs * 2);
      pipeline.zadd(this.onlineUsersKey(), now, userId);
    });
    await pipeline.exec();
  }

  /**
   * Flips users whose every socket stopped heartbeating — the case a crashed instance leaves
   * behind, where no disconnect event will ever arrive.
   */
  async sweepStaleUsers() {
    const staleBefore = this.staleBefore(Date.now());
    const candidateUserIds = await this.redis.client.zrangebyscore(
      this.onlineUsersKey(),
      '-inf',
      staleBefore,
    );

    for (const userId of candidateUserIds) {
      const userKey = this.userSocketsKey(userId);
      await this.redis.client.zremrangebyscore(userKey, '-inf', staleBefore);
      if ((await this.redis.client.zcard(userKey)) > 0) continue;

      // Losing this race is harmless: whichever instance removes the member sends one OFFLINE.
      const removed = await this.redis.client.zrem(this.onlineUsersKey(), userId);
      if (removed === 0) continue;

      try {
        await this.setStatus(userId, 'OFFLINE');
      } catch (error) {
        this.logger.error(`Could not mark stale user ${userId} offline`, error);
      }
    }
  }

  private staleBefore(now: number) {
    return now - this.redis.config.heartbeatTtlMs;
  }

  private userSocketsKey(userId: string) {
    return this.redis.key('presence', 'user', userId);
  }

  private onlineUsersKey() {
    return this.redis.key('presence', 'online');
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
