import { ConfigService } from '@nestjs/config';

export interface LimitsConfig {
  trustProxyHops: number;
  globalRequestsPerMinute: number;
  socketMaxConnectionsPerIp: number;
}

export const DEFAULT_LIMITS_CONFIG: LimitsConfig = {
  trustProxyHops: 1,
  globalRequestsPerMinute: 600,
  socketMaxConnectionsPerIp: 50,
};

/** Called at startup: a malformed value must stop the boot instead of silently disabling a limit. */
export function readLimitsConfig(config: ConfigService): LimitsConfig {
  return {
    trustProxyHops: readInteger(
      config,
      'TRUST_PROXY_HOPS',
      DEFAULT_LIMITS_CONFIG.trustProxyHops,
      0,
    ),
    globalRequestsPerMinute: readInteger(
      config,
      'RATE_LIMIT_GLOBAL_PER_MINUTE',
      DEFAULT_LIMITS_CONFIG.globalRequestsPerMinute,
      1,
    ),
    socketMaxConnectionsPerIp: readInteger(
      config,
      'SOCKET_MAX_CONNECTIONS_PER_IP',
      DEFAULT_LIMITS_CONFIG.socketMaxConnectionsPerIp,
      1,
    ),
  };
}

function readInteger(config: ConfigService, name: string, fallback: number, min: number) {
  const raw = config.get<string | number>(name);
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
  return value;
}
