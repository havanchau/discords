import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ChannelsService } from './channels.service';
import { UpdateChannelOverridesDto } from './dto/channel-overrides.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ReorderChannelsDto } from './dto/reorder-channels.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post('servers/:serverId/channels')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channels.createChannel(user.id, serverId, dto);
  }

  @Get('servers/:serverId/channels')
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.channels.listChannels(user.id, serverId);
  }

  @Put('servers/:serverId/channels/order')
  reorder(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: ReorderChannelsDto,
  ) {
    return this.channels.reorderChannels(user.id, serverId, dto);
  }

  @Get('channels/:channelId')
  getOne(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.channels.getChannel(user.id, channelId);
  }

  @Patch('channels/:channelId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channels.updateChannel(user.id, channelId, dto);
  }

  @Delete('channels/:channelId')
  remove(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.channels.deleteChannel(user.id, channelId);
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
