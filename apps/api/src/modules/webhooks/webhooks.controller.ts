import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/channels/:channelId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.webhooks.list(user.id, serverId, channelId);
  }

  @RateLimit({ keyPrefix: 'webhook-create', limit: 10, windowMs: 60_000 })
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.create(user.id, serverId, channelId, dto);
  }

  @RateLimit({ keyPrefix: 'webhook-regenerate', limit: 10, windowMs: 60_000 })
  @Post(':webhookId/regenerate')
  regenerate(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooks.regenerate(user.id, serverId, channelId, webhookId);
  }

  @RateLimit({ keyPrefix: 'webhook-delete', limit: 10, windowMs: 60_000 })
  @Delete(':webhookId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooks.remove(user.id, serverId, channelId, webhookId);
  }
}
