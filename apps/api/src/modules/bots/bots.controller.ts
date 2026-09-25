import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BotAuthorizationService } from './bot-authorization.service';
import { BotsService } from './bots.service';
import { AuthorizeBotDto } from './dto/authorize-bot.dto';
import { CreateBotDto } from './dto/create-bot.dto';
import { CreateSlashCommandDto } from './dto/create-slash-command.dto';
import { UpdateSlashCommandDto } from './dto/update-slash-command.dto';
import { SlashCommandsService } from './slash-commands.service';

const COMMAND_WRITE_LIMIT = { limit: 30, windowMs: 60_000 };

/** Session routes a person uses to manage their bots and add bots to servers; bots cannot call them. */
@UseGuards(JwtAuthGuard)
@Controller()
export class BotsController {
  constructor(
    private readonly bots: BotsService,
    private readonly authorization: BotAuthorizationService,
    private readonly slashCommands: SlashCommandsService,
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

  /**
   * Slash command registration for a bot's owner, over their own session
   * (`bot-command-registration-ui.md`). The routes below only reach `SlashCommandsService` — the same
   * service, with the same rules, that the bot's token reaches at `/bot-api/servers/:serverId/commands`
   * — after `getRequestBotOrThrow` has proven the caller owns the bot. No rule lives here.
   */
  @Get('bots/:botId/servers')
  listBotServers(@CurrentUser() user: RequestUser, @Param('botId') botId: string) {
    return this.bots.listServers(user.id, botId);
  }

  @Get('bots/:botId/servers/:serverId/commands')
  async listCommands(
    @CurrentUser() user: RequestUser,
    @Param('botId') botId: string,
    @Param('serverId') serverId: string,
  ) {
    const bot = await this.bots.getRequestBotOrThrow(user.id, botId);
    return this.slashCommands.list(bot, serverId);
  }

  @RateLimit({ keyPrefix: 'bot-command-create', ...COMMAND_WRITE_LIMIT })
  @Post('bots/:botId/servers/:serverId/commands')
  async createCommand(
    @CurrentUser() user: RequestUser,
    @Param('botId') botId: string,
    @Param('serverId') serverId: string,
    @Body() dto: CreateSlashCommandDto,
  ) {
    const bot = await this.bots.getRequestBotOrThrow(user.id, botId);
    return this.slashCommands.create(bot, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'bot-command-update', ...COMMAND_WRITE_LIMIT })
  @Patch('bots/:botId/servers/:serverId/commands/:commandId')
  async updateCommand(
    @CurrentUser() user: RequestUser,
    @Param('botId') botId: string,
    @Param('serverId') serverId: string,
    @Param('commandId') commandId: string,
    @Body() dto: UpdateSlashCommandDto,
  ) {
    const bot = await this.bots.getRequestBotOrThrow(user.id, botId);
    return this.slashCommands.update(bot, serverId, commandId, dto);
  }

  @RateLimit({ keyPrefix: 'bot-command-delete', ...COMMAND_WRITE_LIMIT })
  @Delete('bots/:botId/servers/:serverId/commands/:commandId')
  async removeCommand(
    @CurrentUser() user: RequestUser,
    @Param('botId') botId: string,
    @Param('serverId') serverId: string,
    @Param('commandId') commandId: string,
  ) {
    const bot = await this.bots.getRequestBotOrThrow(user.id, botId);
    return this.slashCommands.remove(bot, serverId, commandId);
  }
}
