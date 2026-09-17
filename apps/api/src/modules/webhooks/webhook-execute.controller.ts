import { Body, Controller, HttpException, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WEBHOOK_POSTS_PER_MINUTE } from '@discord-clone/shared';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { ExecuteWebhookDto } from './dto/execute-webhook.dto';
import { WebhookDeliveryService } from './webhook-delivery.service';

const WEBHOOK_POST_WINDOW_MS = 60_000;

/**
 * The public posting endpoint. Deliberately has no `JwtAuthGuard`: the token in the path is the only
 * credential, no cookie or session is read, and CORS does not matter because callers are servers.
 * Guards are per controller in this API, so leaving it off here exposes only this route.
 *
 * Throttled three ways: the global per-IP middleware, the per-IP route limit below, and a per-webhook
 * limit counted in Redis after the token is verified (so a guessed id cannot spend a real webhook's
 * budget). Neither the token nor the body is ever logged.
 */
@Controller('webhooks')
export class WebhookExecuteController {
  constructor(
    private readonly delivery: WebhookDeliveryService,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  @RateLimit({ keyPrefix: 'webhook-execute', limit: 120, windowMs: WEBHOOK_POST_WINDOW_MS })
  @Post(':webhookId/:token')
  async execute(
    @Param('webhookId') webhookId: string,
    @Param('token') token: string,
    @Body() dto: ExecuteWebhookDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const webhook = await this.delivery.authenticate(webhookId, token);
    const limit = await this.limiter.hit(
      `webhook-post:${webhook.id}`,
      WEBHOOK_POSTS_PER_MINUTE,
      WEBHOOK_POST_WINDOW_MS,
    );
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException(
        `Rate limit exceeded. Retry after ${limit.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.delivery.post(webhook, dto);
  }
}
