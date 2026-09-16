import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface SocketUser {
  id: string;
  sessionId: string;
}

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
