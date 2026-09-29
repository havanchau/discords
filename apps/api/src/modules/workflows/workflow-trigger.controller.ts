import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { WORKFLOW_TRIGGER_POSTS_PER_MINUTE } from '@discord-clone/shared';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { TriggerWebhookDto } from './dto/trigger-webhook.dto';
import { WorkflowTriggerService } from './workflow-trigger.service';

const WORKFLOW_TRIGGER_WINDOW_MS = 60_000;

/**
 * The public `WEBHOOK_RECEIVED` posting endpoint. Deliberately has no `JwtAuthGuard`: the token in
 * the path is the only credential, mirroring `WebhookExecuteController`. Rate-limited per token
 * (counted by the token's hash, never the plaintext) in Redis, so a guessed workflow id cannot spend
 * a real workflow's budget; neither the token nor the body is ever logged.
 */
@Controller('workflow-triggers')
export class WorkflowTriggerController {
  constructor(
    private readonly trigger: WorkflowTriggerService,
    private readonly limiter: RedisFixedWindowLimiter,
  ) {}

  @RateLimit({
    keyPrefix: 'workflow-trigger-execute',
    limit: 120,
    windowMs: WORKFLOW_TRIGGER_WINDOW_MS,
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':workflowId/:token')
  async execute(
    @Param('workflowId') workflowId: string,
    @Param('token') token: string,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body() _dto: TriggerWebhookDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Authenticate before counting against the budget: the limiter is keyed on the authenticated
    // workflow's own id, never a pre-auth guess, so a caller cannot spend a real workflow's budget
    // by trying different tokens against it (same order as `WebhookExecuteController`).
    const workflow = await this.trigger.authenticate(workflowId, token);
    const limit = await this.limiter.hit(
      `workflow-trigger:${workflow.id}`,
      WORKFLOW_TRIGGER_POSTS_PER_MINUTE,
      WORKFLOW_TRIGGER_WINDOW_MS,
    );
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException(
        `Rate limit exceeded. Retry after ${limit.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.trigger.receiveWebhook(workflow, idempotencyKey);
  }
}
