import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AcceptOnboardingDto } from './dto/accept-onboarding.dto';
import { CreateBanDto } from './dto/create-ban.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { TimeoutMemberDto } from './dto/timeout-member.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateNicknameDto } from './dto/update-nickname.dto';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { DeleteServerDto, TransferServerDto } from './dto/server-ownership.dto';
import { ServerInsightsService } from './server-insights.service';
import { ServerModerationService } from './server-moderation.service';
import { ServerOnboardingService } from './server-onboarding.service';
import { ServerOwnershipService } from './server-ownership.service';
import { ServersService } from './servers.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ServersController {
  constructor(
    private readonly servers: ServersService,
    private readonly moderation: ServerModerationService,
    private readonly onboarding: ServerOnboardingService,
    private readonly ownership: ServerOwnershipService,
    private readonly insights: ServerInsightsService,
  ) {}

  @RateLimit({ keyPrefix: 'server-create', limit: 5, windowMs: 60_000 })
  @Post('servers')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateServerDto) {
    return this.servers.createServer(user.id, dto);
  }

  @Get('servers')
  listMine(@CurrentUser() user: RequestUser) {
    return this.servers.listForUser(user.id);
  }

  @Get('servers/:serverId')
  getOne(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.servers.getServerForUser(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'server-update', limit: 20, windowMs: 60_000 })
  @Patch('servers/:serverId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateServerDto,
  ) {
    return this.servers.updateServer(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'server-delete', limit: 5, windowMs: 60_000 })
  @Delete('servers/:serverId')
  deleteServer(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: DeleteServerDto,
  ) {
    return this.ownership.deleteServer(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'server-transfer', limit: 5, windowMs: 60_000 })
  @HttpCode(200)
  @Post('servers/:serverId/transfer')
  transferOwnership(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: TransferServerDto,
  ) {
    return this.ownership.transferOwnership(user.id, serverId, dto);
  }

  @Get('servers/:serverId/onboarding')
  getOnboarding(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.onboarding.getOnboarding(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'server-onboarding-update', limit: 20, windowMs: 60_000 })
  @Patch('servers/:serverId/onboarding')
  updateOnboarding(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.onboarding.updateOnboarding(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'server-onboarding-accept', limit: 10, windowMs: 60_000 })
  @HttpCode(200)
  @Post('servers/:serverId/onboarding/accept')
  acceptOnboarding(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: AcceptOnboardingDto,
  ) {
    return this.onboarding.acceptOnboarding(user.id, serverId, dto);
  }

  @Get('servers/:serverId/audit-logs')
  auditLogs(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.servers.listAuditLogs(user.id, serverId);
  }

  @Get('servers/:serverId/insights')
  getInsights(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Query() query: InsightsQueryDto,
  ) {
    return this.insights.getInsights(user.id, serverId, query.range);
  }

  @Get('servers/:serverId/bots')
  listInstalledBots(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.servers.listInstalledBots(user.id, serverId);
  }

  @Patch('servers/:serverId/members/me')
  updateMyMembership(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateNicknameDto,
  ) {
    return this.servers.updateMyMembership(user.id, serverId, dto);
  }

  // Declared before the kick route, which would otherwise take `me` as a member id.
  @RateLimit({ keyPrefix: 'member-leave', limit: 10, windowMs: 60_000 })
  @Delete('servers/:serverId/members/me')
  leave(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.moderation.leave(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'member-kick', limit: 20, windowMs: 60_000 })
  @Delete('servers/:serverId/members/:memberId')
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.moderation.kick(user.id, serverId, memberId);
  }

  @RateLimit({ keyPrefix: 'member-timeout', limit: 30, windowMs: 60_000 })
  @Put('servers/:serverId/members/:memberId/timeout')
  timeoutMember(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Body() dto: TimeoutMemberDto,
  ) {
    return this.moderation.timeout(user.id, serverId, memberId, dto);
  }

  @Get('servers/:serverId/bans')
  listBans(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.moderation.listBans(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'member-ban', limit: 20, windowMs: 60_000 })
  @Post('servers/:serverId/bans')
  async ban(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateBanDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.moderation.ban(user.id, serverId, dto);
    // 201 for a new ban, 200 when the user was already banned, like reports.controller.ts:46-48.
    response.status(result.created ? 201 : 200);
    return result;
  }

  @RateLimit({ keyPrefix: 'member-unban', limit: 20, windowMs: 60_000 })
  @Delete('servers/:serverId/bans/:userId')
  unban(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.moderation.unban(user.id, serverId, targetUserId);
  }

  @RateLimit({ keyPrefix: 'invite-create', limit: 10, windowMs: 60_000 })
  @Post('servers/:serverId/invites')
  createInvite(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.servers.createInvite(user.id, serverId, dto);
  }

  @Get('servers/:serverId/invites')
  listInvites(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.servers.listInvites(user.id, serverId);
  }

  @Delete('servers/:serverId/invites/:inviteId')
  revokeInvite(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.servers.revokeInvite(user.id, serverId, inviteId);
  }

  @RateLimit({ keyPrefix: 'invite-join', limit: 10, windowMs: 60_000 })
  @Post('invites/:code/join')
  joinInvite(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.servers.joinInvite(user.id, code);
  }
}
