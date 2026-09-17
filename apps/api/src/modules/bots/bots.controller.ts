import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BotAuthorizationService } from './bot-authorization.service';
import { BotsService } from './bots.service';
import { AuthorizeBotDto } from './dto/authorize-bot.dto';
import { CreateBotDto } from './dto/create-bot.dto';

/** Session routes a person uses to manage their bots and add bots to servers; bots cannot call them. */
@UseGuards(JwtAuthGuard)
@Controller()
export class BotsController {
  constructor(
    private readonly bots: BotsService,
    private readonly authorization: BotAuthorizationService,
  ) {}

  @Get('bots')
  list(@CurrentUser() user: RequestUser) {
    return this.bots.list(user.id);
  }

  @RateLimit({ keyPrefix: 'bot-create', limit: 10, windowMs: 60_000 })
  @Post('bots')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBotDto) {
    return this.bots.create(user.id, dto);
  }

  @RateLimit({ keyPrefix: 'bot-regenerate', limit: 10, windowMs: 60_000 })
  @Post('bots/:botId/regenerate-token')
  regenerateToken(@CurrentUser() user: RequestUser, @Param('botId') botId: string) {
    return this.bots.regenerateToken(user.id, botId);
  }

  @RateLimit({ keyPrefix: 'bot-delete', limit: 10, windowMs: 60_000 })
  @Delete('bots/:botId')
  remove(@CurrentUser() user: RequestUser, @Param('botId') botId: string) {
    return this.bots.remove(user.id, botId);
  }

  @Get('bots/:botId/authorize')
  authorizationView(@CurrentUser() user: RequestUser, @Param('botId') botId: string) {
    return this.authorization.getAuthorizationView(user.id, botId);
  }

  @RateLimit({ keyPrefix: 'bot-authorize', limit: 10, windowMs: 60_000 })
  @Post('bots/:botId/authorize')
  authorize(
    @CurrentUser() user: RequestUser,
    @Param('botId') botId: string,
    @Body() dto: AuthorizeBotDto,
  ) {
    return this.authorization.authorize(user.id, botId, dto);
  }

  @RateLimit({ keyPrefix: 'bot-remove', limit: 10, windowMs: 60_000 })
  @Delete('servers/:serverId/bots/:botId')
  removeFromServer(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('botId') botId: string,
  ) {
    return this.authorization.removeFromServer(user.id, serverId, botId);
  }
}
