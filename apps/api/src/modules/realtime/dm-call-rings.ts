import { RedisService } from '../redis/redis.service';

export type DmCallMode = 'voice' | 'video';

export interface DmCallRing {
  conversationId: string;
  callerUserId: string;
  mode: DmCallMode;
  isGroup: boolean;
  memberUserIds: string[];
}

export const DM_CALL_RING_TIMEOUT_MS = 30_000;

/*
 * Pending DM call rings, one per conversation, kept in Redis so any instance can read, stop or
 * expire a ring the caller started somewhere else. A ring ends when someone answers, the caller
 * cancels, a 1-1 callee declines, or the deadline passes.
 *
 * Expiry is driven by a deadline in a sorted set rather than a `setTimeout`: a timer only exists
 * inside the process that created it, so a restart used to drop pending rings silently, and an
 * instance holding no part of the conversation could never fire the timeout.
 */
export class DmCallRings {
  constructor(
    private readonly redis: RedisService,
    private readonly onExpire: (ring: DmCallRing) => void,
    private readonly timeoutMs = DM_CALL_RING_TIMEOUT_MS,
  ) {}

  async start(ring: DmCallRing) {
    await this.clear(ring.conversationId);
    const expiresAt = Date.now() + this.timeoutMs;
    await this.redis.client
      .multi()
      // The deadline in the sorted set is what ends the ring; this TTL only stops an un-swept key
      // from leaking, so it must outlive the deadline or the sweep would find nothing to report.
      .set(this.ringKey(ring.conversationId), JSON.stringify(ring), 'PX', this.timeoutMs * 4)
      .zadd(this.deadlinesKey(), expiresAt, ring.conversationId)
      .exec();
  }

  async get(conversationId: string): Promise<DmCallRing | undefined> {
    const raw = await this.redis.client.get(this.ringKey(conversationId));
    return this.parse(raw);
  }

  async clear(conversationId: string): Promise<DmCallRing | undefined> {
    const raw = await this.redis.client.get(this.ringKey(conversationId));
    await this.redis.client
      .multi()
      .del(this.ringKey(conversationId))
      .zrem(this.deadlinesKey(), conversationId)
      .exec();
    return this.parse(raw);
  }

  /**
   * Fires the expiry for every ring past its deadline. Removing the member from the sorted set is
   * the claim: exactly one instance gets a non-zero reply, so a ring is only ever missed once.
   */
  async sweepExpired() {
    const conversationIds = await this.redis.client.zrangebyscore(
      this.deadlinesKey(),
      '-inf',
      Date.now(),
    );

    for (const conversationId of conversationIds) {
      const claimed = await this.redis.client.zrem(this.deadlinesKey(), conversationId);
      if (claimed === 0) continue;

      const raw = await this.redis.client.get(this.ringKey(conversationId));
      await this.redis.client.del(this.ringKey(conversationId));
      const ring = this.parse(raw);
      if (ring) this.onExpire(ring);
    }
  }

  private parse(raw: string | null): DmCallRing | undefined {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as DmCallRing;
    } catch {
      return undefined;
    }
  }

  private ringKey(conversationId: string) {
    return this.redis.key('dm', 'ring', conversationId);
  }

  private deadlinesKey() {
    return this.redis.key('dm', 'ring-deadlines');
  }
}
