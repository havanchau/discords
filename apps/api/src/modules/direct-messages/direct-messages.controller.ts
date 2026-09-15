import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectMessagesService } from './direct-messages.service';
import { AddConversationMemberDto } from './dto/add-conversation-member.dto';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@UseGuards(JwtAuthGuard)
@Controller('direct-conversations')
export class DirectMessagesController {
  constructor(
    private readonly directMessages: DirectMessagesService,
    private readonly conversations: DirectConversationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.directMessages.listConversations(user.id);
  }

  @RateLimit({ keyPrefix: 'group-conversation-create', limit: 10, windowMs: 60_000 })
  @Post()
  createGroup(@CurrentUser() user: RequestUser, @Body() dto: CreateGroupConversationDto) {
    return this.conversations.createGroup(user.id, dto);
  }

  @RateLimit({ keyPrefix: 'group-conversation-update', limit: 30, windowMs: 60_000 })
  @Patch(':conversationId')
  rename(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.rename(user.id, conversationId, dto);
  }

  @RateLimit({ keyPrefix: 'group-conversation-member', limit: 30, windowMs: 60_000 })
  @Post(':conversationId/members')
  addMember(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: AddConversationMemberDto,
  ) {
    return this.conversations.addMember(user.id, conversationId, dto);
  }

  @RateLimit({ keyPrefix: 'group-conversation-member', limit: 30, windowMs: 60_000 })
  @Delete(':conversationId/members/:userId')
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.conversations.removeMember(user.id, conversationId, targetUserId);
  }

  @Get(':conversationId/messages')
  listMessages(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.directMessages.listMessages(user.id, conversationId, cursor);
  }

  @Post(':conversationId/read')
  markRead(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() body: { messageId?: string },
  ) {
    return this.directMessages.markConversationRead(user.id, conversationId, body?.messageId);
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
