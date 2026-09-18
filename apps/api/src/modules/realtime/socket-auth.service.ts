import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { secretTokenMatches } from '@/common/secret-token';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { parseBotToken } from '@/modules/bots/bot-token';
import { SocketUser } from './socket-user';

/** Compared against when the id is unknown, so response time does not reveal valid bot ids. */
const UNKNOWN_BOT_HASH = '0'.repeat(64);

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A bot token (`Authorization: Bot <token>` or `handshake.auth.botToken`) is tried first, mirroring
   * `BotAuthGuard`'s REST check exactly (same parse, same constant-time compare, same
   * owner-deletion-pending refusal). Anything else is checked as a human session token, unchanged.
   */
  async authenticate(client: Socket): Promise<SocketUser> {
    const botToken = this.readBotToken(client);
    if (botToken) {
      return this.authenticateBot(botToken);
    }
    return this.authenticateHuman(client);
  }

  private readBotToken(client: Socket): string | undefined {
    const authHeader = client.handshake.headers.authorization;
    const [scheme, token] = authHeader?.split(' ') ?? [];
    if (scheme === 'Bot' && token) return token;

    const auth = client.handshake.auth as { botToken?: unknown } | undefined;
    return typeof auth?.botToken === 'string' ? auth.botToken : undefined;
  }

  private async authenticateBot(token: string): Promise<SocketUser> {
    const parsed = parseBotToken(token);
    const bot = parsed
      ? await this.prisma.bot.findUnique({
          where: { id: parsed.botId },
          select: {
            id: true,
            tokenHash: true,
            botUser: { select: { id: true, kind: true } },
            owner: { select: { deletionRequestedAt: true } },
          },
        })
      : null;
    const matches = secretTokenMatches(parsed?.secret ?? token, bot?.tokenHash ?? UNKNOWN_BOT_HASH);
    if (!bot || !matches || bot.botUser.kind !== 'BOT' || bot.owner.deletionRequestedAt) {
      throw new UnauthorizedException('Invalid bot token');
    }
    return { kind: 'bot', id: bot.botUser.id, botId: bot.id };
  }

  /** Verifies the handshake token and that its session is still live. */
  private async authenticateHuman(client: Socket): Promise<SocketUser> {
    const authToken: unknown = client.handshake.auth?.token;
    const token =
      (typeof authToken === 'string' ? authToken : '') ||
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

    return { kind: 'human', id: payload.sub, sessionId: payload.sid };
  }
}
