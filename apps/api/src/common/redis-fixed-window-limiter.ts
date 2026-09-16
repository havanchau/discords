import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/modules/redis/redis.service';

export interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Increments the window counter and sets its expiry only on creation, so the window starts at the
 * first hit and is never extended by later ones. Returns the count and the remaining window.
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

/**
 * Fixed-window counter shared by every API instance. It replaced a per-process in-memory counter,
 * which cannot hold a ceiling across a deployment: counting per instance would make every
 * configured limit N times looser once N instances run.
 */
@Injectable()
export class RedisFixedWindowLimiter {
  private readonly logger = new Logger(RedisFixedWindowLimiter.name);

  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowMs: number): Promise<LimitResult> {
    const retryAfterSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    try {
      const [count, pttl] = (await this.redis.client.eval(
        HIT_SCRIPT,
        1,
        this.redis.key('ratelimit', key),
        String(windowMs),
      )) as [number, number];

      return {
        allowed: count <= limit,
        retryAfterSeconds: pttl > 0 ? Math.max(1, Math.ceil(pttl / 1000)) : retryAfterSeconds,
      };
    } catch (error) {
      // Fail closed: an unreachable Redis must not silently remove the abuse ceiling.
      this.logger.error(
        `Rate limit check failed for "${key}", denying the request`,
        error instanceof Error ? error.stack : error,
      );
      return { allowed: false, retryAfterSeconds };
    }
  }
}
