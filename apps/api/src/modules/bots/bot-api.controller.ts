import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { BOT_MESSAGES_PER_MINUTE } from '@discord-clone/shared';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { ServersService } from '@/modules/servers/servers.service';
import { BotAuthGuard } from './bot-auth.guard';
import { BotMessagesService } from './bot-messages.service';
import { CurrentBot, type RequestBot } from './bot-request';
import { BotCreateMessageDto } from './dto/bot-create-message.dto';

const BOT_MESSAGE_WINDOW_MS = 60_000;

/**
 * The whole bot-token surface in phase 1, as an explicit allowlist: a bot can reach these routes and
 * nothing else, because every other controller is guarded by `JwtAuthGuard`, which refuses a bot
 * token. No socket, upload, moderation or settings route is open to a bot.
 *
 * Throttled by the global per-IP middleware, the per-IP route limits, a per-bot ceiling on every
 * route (`BotAuthGuard`) and a per-bot send limit below.
 */
@UseGuards(BotAuthGuard)
@Controller('bot-api')
export class BotApiController {
  constructor(
    private readonly botMessages: BotMessagesService,
    private readonly servers: ServersService,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  @Get('users/@me')
  me(@CurrentBot() bot: RequestBot) {
    return this.botMessages.getIdentity(bot);
  }

  @Get('servers')
  listServers(@CurrentBot() bot: RequestBot) {
    return this.servers.listForUser(bot.userId);
  }

  @Get('channels/:channelId/messages')
  listMessages(
    @CurrentBot() bot: RequestBot,
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.botMessages.listMessages(bot, channelId, cursor);
  }

  @RateLimit({ keyPrefix: 'bot-message-create', limit: 120, windowMs: BOT_MESSAGE_WINDOW_MS })
  @Post('channels/:channelId/messages')
  async createMessage(
    @CurrentBot() bot: RequestBot,
    @Param('channelId') channelId: string,
    @Body() dto: BotCreateMessageDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const limit = await this.limiter.hit(
      `bot-message:${bot.botId}`,
      BOT_MESSAGES_PER_MINUTE,
      BOT_MESSAGE_WINDOW_MS,
    );
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException(
        `Rate limit exceeded. Retry after ${limit.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.botMessages.createMessage(bot, channelId, dto);
  }
}
