import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '@/modules/redis/redis.service';
import { CallRegistryService } from './call-registry.service';
import { DmCallsService } from './dm-calls.service';
import { PresenceService } from './presence.service';
import { readSocketUser } from './socket-user';

/** A ring must not outlive its deadline by much, so it is swept far more often than the heartbeat. */
const RING_SWEEP_INTERVAL_MS = 2_000;

/**
 * Proves this instance is alive to the other instances, and cleans up after the ones that are not.
 *
 * Presence and call entries in Redis carry the timestamp of their last heartbeat. Refreshing them
 * here is what separates "this socket is still connected" from "the instance holding this socket
 * was killed" — the second case never runs a disconnect handler, so nothing else would clean it up.
 */
@Injectable()
export class RealtimeHeartbeatService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeHeartbeatService.name);
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private ringSweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly redis: RedisService,
    private readonly presence: PresenceService,
    private readonly calls: CallRegistryService,
    private readonly dmCalls: DmCallsService,
  ) {}

  start(server: Server) {
    this.heartbeatTimer = setInterval(() => {
      void this.tick(server);
    }, this.redis.config.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();

    this.ringSweepTimer = setInterval(() => {
      void this.sweepRings();
    }, RING_SWEEP_INTERVAL_MS);
    this.ringSweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ringSweepTimer) clearInterval(this.ringSweepTimer);
  }

  private async tick(server: Server) {
    try {
      // `server.sockets.sockets` holds this instance's own sockets only, which is exactly the set
      // this instance is entitled to vouch for.
      const localSockets = [...server.sockets.sockets.values()];
      const socketsByUserId = new Map<string, string[]>();
      localSockets.forEach((socket) => {
        const user = readSocketUser(socket);
        // A bot never joins presence tracking (`realtime.gateway.ts` → connectBot); heartbeating it
        // here would flip it ONLINE, which `bot-gateway-and-slash-commands.md` explicitly refuses.
        if (!user || user.kind !== 'human') return;
        socketsByUserId.set(user.id, [...(socketsByUserId.get(user.id) ?? []), socket.id]);
      });

      await this.presence.heartbeat(socketsByUserId);
      await this.calls.heartbeat(localSockets.map((socket) => socket.id));
      await this.presence.sweepStaleUsers();
    } catch (error) {
      this.logger.error('Realtime heartbeat failed', error instanceof Error ? error.stack : error);
    }
  }

  private async sweepRings() {
    try {
      await this.dmCalls.sweepExpiredRings();
    } catch (error) {
      this.logger.error('DM ring sweep failed', error instanceof Error ? error.stack : error);
    }
  }
}
