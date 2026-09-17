import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { PollsService } from './polls.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @RateLimit({ keyPrefix: 'poll-create', limit: 10, windowMs: 60_000 })
  @Post('channels/:channelId/polls')
  createInChannel(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreatePollDto,
  ) {
    return this.polls.createChannelPoll(user.id, channelId, dto);
  }

  @RateLimit({ keyPrefix: 'poll-create', limit: 10, windowMs: 60_000 })
  @Post('conversations/:conversationId/polls')
  createInConversation(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreatePollDto,
  ) {
    return this.polls.createDirectPoll(user.id, conversationId, dto);
  }

  @Get('polls/:pollId')
  get(@CurrentUser() user: RequestUser, @Param('pollId') pollId: string) {
    return this.polls.getPoll(user.id, pollId);
  }

  @RateLimit({ keyPrefix: 'poll-vote', limit: 60, windowMs: 60_000 })
  @Put('polls/:pollId/votes')
  vote(
    @CurrentUser() user: RequestUser,
    @Param('pollId') pollId: string,
    @Body() dto: VotePollDto,
  ) {
    return this.polls.vote(user.id, pollId, dto);
  }

  @RateLimit({ keyPrefix: 'poll-close', limit: 20, windowMs: 60_000 })
  @Post('polls/:pollId/close')
  close(@CurrentUser() user: RequestUser, @Param('pollId') pollId: string) {
    return this.polls.close(user.id, pollId);
  }
}
