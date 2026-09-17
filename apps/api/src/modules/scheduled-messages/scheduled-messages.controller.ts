import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateScheduledMessageDto } from './dto/create-scheduled-message.dto';
import { UpdateScheduledMessageDto } from './dto/update-scheduled-message.dto';
import { ScheduledMessagesService } from './scheduled-messages.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ScheduledMessagesController {
  constructor(private readonly scheduledMessages: ScheduledMessagesService) {}

  @Get('channels/:channelId/scheduled-messages')
  listForChannel(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.scheduledMessages.listForChannel(user.id, channelId);
  }

  @RateLimit({ keyPrefix: 'scheduled-message-create', limit: 10, windowMs: 60_000 })
  @Post('channels/:channelId/scheduled-messages')
  createForChannel(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateScheduledMessageDto,
  ) {
    return this.scheduledMessages.createForChannel(user.id, channelId, dto);
  }

  @Get('direct-conversations/:conversationId/scheduled-messages')
  listForConversation(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.scheduledMessages.listForConversation(user.id, conversationId);
  }

  @RateLimit({ keyPrefix: 'scheduled-message-create', limit: 10, windowMs: 60_000 })
  @Post('direct-conversations/:conversationId/scheduled-messages')
  createForConversation(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateScheduledMessageDto,
  ) {
    return this.scheduledMessages.createForConversation(user.id, conversationId, dto);
  }

  @RateLimit({ keyPrefix: 'scheduled-message-write', limit: 20, windowMs: 60_000 })
  @Patch('scheduled-messages/:scheduledMessageId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('scheduledMessageId') scheduledMessageId: string,
    @Body() dto: UpdateScheduledMessageDto,
  ) {
    return this.scheduledMessages.update(user.id, scheduledMessageId, dto);
  }

  @RateLimit({ keyPrefix: 'scheduled-message-write', limit: 20, windowMs: 60_000 })
  @Delete('scheduled-messages/:scheduledMessageId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('scheduledMessageId') scheduledMessageId: string,
  ) {
    return this.scheduledMessages.remove(user.id, scheduledMessageId);
  }
}
