import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateNicknameDto } from './dto/update-nickname.dto';
import { ServersService } from './servers.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ServersController {
  constructor(private readonly servers: ServersService) {}

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

  @Get('servers/:serverId/audit-logs')
  auditLogs(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.servers.listAuditLogs(user.id, serverId);
  }

  @Patch('servers/:serverId/members/me')
  updateMyMembership(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateNicknameDto,
  ) {
    return this.servers.updateMyMembership(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'member-kick', limit: 20, windowMs: 60_000 })
  @Delete('servers/:serverId/members/:memberId')
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.servers.removeMember(user.id, serverId, memberId);
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
