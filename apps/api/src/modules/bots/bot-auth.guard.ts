import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BOT_API_REQUESTS_PER_MINUTE } from '@discord-clone/shared';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { secretTokenMatches } from '@/common/secret-token';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { RequestBot } from './bot-request';
import { parseBotToken } from './bot-token';

const BOT_API_WINDOW_MS = 60_000;
/** Compared against when the id is unknown, so response time does not reveal valid bot ids. */
const UNKNOWN_BOT_HASH = '0'.repeat(64);

/**
 * Authenticates `/bot-api/*` with `Authorization: Bot <token>` and nothing else. It is the only guard
 * on those routes, and `JwtAuthGuard` accepts only `Bearer` session tokens, so neither credential
 * works where the other is expected. A bot whose owner has asked to delete their account is refused
 * for the whole grace period. The token is never logged.
 */
@Injectable()
export class BotAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { bot?: RequestBot }>();
    const [scheme, token, extra] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bot' || !token || extra !== undefined) {
      throw new UnauthorizedException('Missing bot token');
    }

    const parsed = parseBotToken(token);
    const bot = parsed
      ? await this.prisma.bot.findUnique({
          where: { id: parsed.botId },
          select: {
            id: true,
            tokenHash: true,
            botUser: { select: { id: true, username: true, kind: true } },
            owner: { select: { deletionRequestedAt: true } },
          },
        })
      : null;
    // Hash even for an unknown id or a malformed token, so every refusal costs the same.
    const matches = secretTokenMatches(parsed?.secret ?? token, bot?.tokenHash ?? UNKNOWN_BOT_HASH);
    if (!bot || !matches || bot.botUser.kind !== 'BOT' || bot.owner.deletionRequestedAt) {
      throw new UnauthorizedException('Invalid bot token');
    }

    // Counted per bot after the token is verified, so a guessed id cannot spend a real bot's budget.
    const limit = await this.limiter.hit(
      `bot-api:${bot.id}`,
      BOT_API_REQUESTS_PER_MINUTE,
      BOT_API_WINDOW_MS,
    );
    if (!limit.allowed) {
      http.getResponse<Response>().setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException(
        `Rate limit exceeded. Retry after ${limit.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    request.bot = { botId: bot.id, userId: bot.botUser.id, username: bot.botUser.username };
    return true;
  }
}
