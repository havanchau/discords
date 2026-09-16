import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface SocketUser {
  id: string;
  sessionId: string;
}

/** Every handler reads the user this way; the socket is authenticated once, at connection time. */
export function getSocketUser(client: Socket): SocketUser {
  const user = client.data.user as SocketUser | undefined;
  if (!user) {
    throw new UnauthorizedException('Unauthenticated socket');
  }
  return user;
}
