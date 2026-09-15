interface Bucket {
  count: number;
  resetAt: number;
}

export interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export const DEFAULT_LIMITER_MAX_KEYS = 100_000;
const PERIODIC_SWEEP_MS = 60_000;
const FULL_SWEEP_THROTTLE_MS = 1_000;

/**
 * In-memory fixed-window counter. Bounded to `maxKeys` so a flood from many distinct keys
 * cannot grow memory without limit; evicted keys fail open and start a fresh window.
 */
export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweepAt = 0;

  constructor(private readonly maxKeys = DEFAULT_LIMITER_MAX_KEYS) {}

  get size() {
    return this.buckets.size;
  }

  hit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
    if (now - this.lastSweepAt >= PERIODIC_SWEEP_MS) {
      this.sweepExpired(now);
    }

    const bucket = this.buckets.get(key);

    if (bucket && bucket.resetAt > now) {
      bucket.count += 1;
      return {
        allowed: bucket.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    // Re-insert so Map order tracks window start, which makes the first key the oldest to evict.
    this.buckets.delete(key);
    this.makeRoom(now);
    this.buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: limit >= 1, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
  }

  private makeRoom(now: number) {
    if (this.buckets.size < this.maxKeys) return;

    // Sweeping is O(n); throttle it so a full map under attack does not cost a full scan per request.
    if (now - this.lastSweepAt >= FULL_SWEEP_THROTTLE_MS) {
      this.sweepExpired(now);
    }

    while (this.buckets.size >= this.maxKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) return;
      this.buckets.delete(oldestKey);
    }
  }

  private sweepExpired(now: number) {
    this.lastSweepAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
