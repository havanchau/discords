import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelsService } from './channels.service';
import { UpdateChannelOverridesDto } from './dto/channel-overrides.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post('servers/:serverId/channels')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateChannelDto
  ) {
    return this.channels.createChannel(user.id, serverId, dto);
  }

  @Get('servers/:serverId/channels')
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.channels.listChannels(user.id, serverId);
  }

  @Get('channels/:channelId')
  getOne(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.channels.getChannel(user.id, channelId);
  }

  @Patch('channels/:channelId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto
  ) {
    return this.channels.updateChannel(user.id, channelId, dto);
  }

  @Get('channels/:channelId/overrides')
  listOverrides(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.channels.listPermissionOverrides(user.id, channelId);
  }

  @Patch('channels/:channelId/overrides')
  updateOverrides(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelOverridesDto,
  ) {
    return this.channels.updatePermissionOverrides(user.id, channelId, dto);
  }
}
