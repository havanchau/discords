import { Server, Socket } from 'socket.io';
import { resolveForwardedIp } from '../../common/client-ip';
import { FixedWindowLimiter } from '../../common/fixed-window-limiter';

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
  const userId = (client.data.user as { id?: string } | undefined)?.id;
  return userId ? `user:${userId}` : `socket:${client.id}`;
}

/**
 * Handshake middleware: caps connection attempts and concurrently open sockets per IP before
 * the gateway runs JWT verification and database work, and caps total events per user.
 */
export function attachSocketGuards(server: Server, limiter: FixedWindowLimiter, options: SocketGuardOptions) {
  const openSocketsByIp = new Map<string, number>();

  server.use((socket, next) => {
    const ip = resolveForwardedIp(
      socket.handshake.headers['x-forwarded-for'],
      socket.handshake.address,
      options.trustProxyHops,
    );

    if (!limiter.hit(`socket-connect:${ip}`, SOCKET_CONNECTS_PER_MINUTE, ONE_MINUTE_MS).allowed) {
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
      if (!limiter.hit(key, SOCKET_EVENTS_PER_MINUTE, ONE_MINUTE_MS).allowed) {
        socket.disconnect(true);
        return;
      }
      nextEvent();
    });

    next();
  });
}
