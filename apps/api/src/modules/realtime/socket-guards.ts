import { Server, Socket } from 'socket.io';
import { resolveForwardedIp } from '@/common/client-ip';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { readSocketUser } from './socket-user';

export const SOCKET_MAX_PAYLOAD_BYTES = 256_000;
const SOCKET_CONNECTS_PER_MINUTE = 30;
const SOCKET_EVENTS_PER_MINUTE = 300;
const ONE_MINUTE_MS = 60_000;

export interface SocketGuardOptions {
  trustProxyHops: number;
  maxConnectionsPerIp: number;
}

/** Stable limit key for a socket: the user once authenticated, so reconnecting does not reset limits. */
export function socketLimitSubject(client: Socket) {
  const userId = readSocketUser(client)?.id;
  return userId ? `user:${userId}` : `socket:${client.id}`;
}

/**
 * Handshake middleware: caps connection attempts and concurrently open sockets per IP before
 * the gateway runs JWT verification and database work, and caps total events per user.
 *
 * Attempt and event budgets are counted in Redis so the ceiling holds across every instance.
 * The concurrently-open count stays process-local on purpose: it is decremented on transport close,
 * and a shared counter would leak on every killed instance with no close event to balance it.
 */
export function attachSocketGuards(
  server: Server,
  limiter: RedisFixedWindowLimiter,
  options: SocketGuardOptions,
) {
  const openSocketsByIp = new Map<string, number>();

  server.use((socket, next) => {
    const ip = resolveForwardedIp(
      socket.handshake.headers['x-forwarded-for'],
      socket.handshake.address,
      options.trustProxyHops,
    );

    limiter
      .hit(`socket-connect:${ip}`, SOCKET_CONNECTS_PER_MINUTE, ONE_MINUTE_MS)
      .then((result) => {
        if (!result.allowed) {
          next(new Error('Too many connection attempts'));
          return;
        }

        const openSockets = openSocketsByIp.get(ip) ?? 0;
        if (openSockets >= options.maxConnectionsPerIp) {
          next(new Error('Too many open connections'));
          return;
        }

        openSocketsByIp.set(ip, openSockets + 1);
        // The transport close fires even when the socket never finishes connecting, so the count cannot leak.
        socket.conn.once('close', () => {
          const remaining = (openSocketsByIp.get(ip) ?? 1) - 1;
          if (remaining > 0) {
            openSocketsByIp.set(ip, remaining);
          } else {
            openSocketsByIp.delete(ip);
          }
        });

        socket.use((_packet, nextEvent) => {
          const key = `socket-events:${socketLimitSubject(socket)}`;
          limiter
            .hit(key, SOCKET_EVENTS_PER_MINUTE, ONE_MINUTE_MS)
            .then((eventResult) => {
              if (!eventResult.allowed) {
                socket.disconnect(true);
                return;
              }
              nextEvent();
            })
            .catch(() => socket.disconnect(true));
        });

        next();
      })
      // The limiter already denies on a Redis failure; this only covers an unexpected throw.
      .catch(() => next(new Error('Connection rejected')));
  });
}
