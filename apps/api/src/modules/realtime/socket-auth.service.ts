import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { SocketUser } from './socket-user';

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Verifies the handshake token and that its session is still live. */
  async authenticate(client: Socket): Promise<SocketUser> {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(token, {
      secret: this.config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedException('Invalid token');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    return { id: payload.sub, sessionId: payload.sid };
  }
}
