import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { ServersService } from './servers.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ServersController {
  constructor(private readonly servers: ServersService) {}

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

  @Post('servers/:serverId/invites')
  createInvite(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateInviteDto
  ) {
    return this.servers.createInvite(user.id, serverId, dto);
  }

  @Post('invites/:code/join')
  joinInvite(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.servers.joinInvite(user.id, code);
  }
}
