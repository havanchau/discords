import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
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
    @Body() dto: UpdateServerDto
  ) {
    return this.servers.updateServer(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'invite-create', limit: 10, windowMs: 60_000 })
  @Post('servers/:serverId/invites')
  createInvite(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateInviteDto
  ) {
    return this.servers.createInvite(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'invite-join', limit: 10, windowMs: 60_000 })
  @Post('invites/:code/join')
  joinInvite(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.servers.joinInvite(user.id, code);
  }
}
