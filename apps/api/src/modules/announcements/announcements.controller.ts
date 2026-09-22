import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ChannelFollowsService } from './channel-follows.service';
import { CreateFollowDto } from './dto/create-follow.dto';
import { PublishService } from './publish.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class AnnouncementsController {
  constructor(
    private readonly follows: ChannelFollowsService,
    private readonly publisher: PublishService,
  ) {}

  @Get('channels/:channelId/followers')
  listFollowers(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.follows.listFollowers(user.id, channelId);
  }

  /** `201` for a new follow, `200` when this pair was already following. */
  @RateLimit({ keyPrefix: 'channel-follow-create', limit: 10, windowMs: 60_000 })
  @Post('channels/:channelId/followers')
  async follow(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateFollowDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.follows.follow(user.id, channelId, dto);
    if (!result.created) response.status(200);
    return { follow: result.follow };
  }

  @RateLimit({ keyPrefix: 'channel-follow-delete', limit: 10, windowMs: 60_000 })
  @Delete('channels/:channelId/followers/:followId')
  unfollow(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Param('followId') followId: string,
  ) {
    return this.follows.unfollow(user.id, channelId, followId);
  }

  @Get('channels/:channelId/followed-channels')
  listFollowedChannels(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.follows.listFollowedChannels(user.id, channelId);
  }

  /** `200`: publishing changes an existing message rather than creating a resource. */
  @RateLimit({ keyPrefix: 'message-publish', limit: 10, windowMs: 60_000 })
  @HttpCode(200)
  @Post('messages/:messageId/publish')
  publish(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string) {
    return this.publisher.publish(user.id, messageId);
  }
}
