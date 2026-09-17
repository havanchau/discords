import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';
import { ReportServerDto } from './dto/report-server.dto';
import { UpdateDiscoveryDto } from './dto/update-discovery.dto';
import { ServerDiscoveryService } from './server-discovery.service';

/** Every route needs a signed-in user; the directory is never anonymous. */
@UseGuards(JwtAuthGuard)
@Controller()
export class ServerDiscoveryController {
  constructor(private readonly discovery: ServerDiscoveryService) {}

  @Get('servers/:serverId/discovery')
  getSettings(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.discovery.getSettings(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'server-discovery-update', limit: 20, windowMs: 60_000 })
  @Patch('servers/:serverId/discovery')
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateDiscoveryDto,
  ) {
    return this.discovery.updateSettings(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'discovery-search', limit: 60, windowMs: 60_000 })
  @Get('discovery/servers')
  search(@Query() query: DiscoveryQueryDto) {
    return this.discovery.search(query);
  }

  // Same limit as `POST /invites/:code/join`, which this ends in.
  @RateLimit({ keyPrefix: 'invite-join', limit: 10, windowMs: 60_000 })
  @Post('discovery/servers/:serverId/join')
  join(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.discovery.join(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'server-report', limit: 5, windowMs: 10 * 60_000 })
  @Post('discovery/servers/:serverId/report')
  report(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: ReportServerDto,
  ) {
    return this.discovery.report(user.id, serverId, dto);
  }
}
