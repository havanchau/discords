import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AddStageSpeakerDto } from './dto/stage-speaker.dto';
import { StageService } from './stage.service';

/** Stage moderation is REST; the `stage:*` socket events only keep open clients in sync. */
@UseGuards(JwtAuthGuard)
@Controller('channels/:channelId/stage')
export class StageController {
  constructor(private readonly stage: StageService) {}

  @Get()
  roster(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.stage.getRoster(user.id, channelId);
  }

  @RateLimit({ keyPrefix: 'stage-request', limit: 10, windowMs: 60_000 })
  @Post('request-to-speak')
  requestToSpeak(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.stage.requestToSpeak(user.id, channelId);
  }

  @Delete('request-to-speak')
  withdrawRequest(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.stage.withdrawRequest(user.id, channelId);
  }

  @RateLimit({ keyPrefix: 'stage-speaker', limit: 30, windowMs: 60_000 })
  @Post('speakers')
  addSpeaker(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: AddStageSpeakerDto,
  ) {
    return this.stage.addSpeaker(user.id, channelId, dto.userId);
  }

  @RateLimit({ keyPrefix: 'stage-speaker', limit: 30, windowMs: 60_000 })
  @Delete('speakers/:userId')
  removeSpeaker(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
  ) {
    return this.stage.removeSpeaker(user.id, channelId, userId);
  }
}
