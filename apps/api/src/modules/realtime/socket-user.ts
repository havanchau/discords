import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';

/**
 * A human socket authenticates with a session JWT and carries `sessionId` (used to disconnect a
 * specific session's sockets, `disconnectSessions`). A bot socket authenticates with a bot token
 * (`Authorization: Bot <token>`) and carries `botId` instead — see
 * `docs/features/bot-gateway-and-slash-commands.md`.
 */
export type SocketUser =
  | { kind: 'human'; id: string; sessionId: string }
  | { kind: 'bot'; id: string; botId: string };

/** `socket.data` is untyped in socket.io; this is the one place that knows what the gateway stores there. */
interface SocketData {
  user?: SocketUser;
}

/** Accepts local and remote (`fetchSockets`) sockets alike; both expose `data`. */
export function readSocketUser(client: { data: unknown }): SocketUser | undefined {
  return (client.data as SocketData | undefined)?.user;
}

export function setSocketUser(client: Socket, user: SocketUser) {
  (client.data as SocketData).user = user;
}

/** Every handler reads the user this way; the socket is authenticated once, at connection time. */
export function getSocketUser(client: Socket): SocketUser {
  const user = readSocketUser(client);
  if (!user) {
    throw new UnauthorizedException('Unauthenticated socket');
  }
  return user;
}

/**
 * Every write handler (everything but the transport's own heartbeat) calls this first: a bot socket
 * is receive-only, so any inbound event throws instead of being processed. Keeping every write on
 * REST means a bot cannot bypass the `/bot-api/*` allowlist, its permission checks or its rate limits
 * by finding a socket event that skips them.
 */
export function requireHumanSocketUser(client: Socket) {
  const user = getSocketUser(client);
  if (user.kind !== 'human') {
    throw new UnauthorizedException('Bot sockets are receive-only');
  }
  return user;
}
