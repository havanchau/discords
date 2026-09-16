import { ConfigService } from '@nestjs/config';

export interface RedisConfig {
  url: string;
  keyPrefix: string;
  /** How long a socket's presence/call entry survives without a heartbeat before it is pruned. */
  heartbeatTtlMs: number;
  heartbeatIntervalMs: number;
}

export const DEFAULT_REDIS_CONFIG = {
  keyPrefix: 'discord',
  heartbeatTtlMs: 90_000,
  heartbeatIntervalMs: 30_000,
};

/**
 * Called at startup: realtime state lives in Redis, so a missing or malformed URL must stop the boot
 * instead of silently starting an instance that cannot see the other instances' presence and calls.
 */
export function readRedisConfig(config: ConfigService): RedisConfig {
  const url = config.get<string>('REDIS_URL');
  if (!url) {
    throw new Error(
      'REDIS_URL must be set: realtime presence, calls and rate limits require Redis',
    );
  }
  if (!/^rediss?:\/\//.test(url)) {
    throw new Error('REDIS_URL must start with redis:// or rediss://');
  }

  return {
    url,
    keyPrefix: config.get<string>('REDIS_KEY_PREFIX') || DEFAULT_REDIS_CONFIG.keyPrefix,
    heartbeatTtlMs: DEFAULT_REDIS_CONFIG.heartbeatTtlMs,
    heartbeatIntervalMs: DEFAULT_REDIS_CONFIG.heartbeatIntervalMs,
  };
}
