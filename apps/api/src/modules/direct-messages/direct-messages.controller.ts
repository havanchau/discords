import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DirectMessagesService } from './direct-messages.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('direct-conversations')
export class DirectMessagesController {
  constructor(private readonly directMessages: DirectMessagesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.directMessages.listConversations(user.id);
  }

  @Get(':conversationId/messages')
  listMessages(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.directMessages.listMessages(user.id, conversationId, cursor);
  }

  @RateLimit({ keyPrefix: 'direct-message-create', limit: 40, windowMs: 60_000 })
  @Post(':conversationId/messages')
  createMessage(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateDirectMessageDto,
  ) {
    return this.directMessages.createMessage(user.id, conversationId, dto);
  }
}
