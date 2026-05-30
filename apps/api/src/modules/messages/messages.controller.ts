import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('channels/:channelId/messages')
  list(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string
  ) {
    return this.messages.listMessages(user.id, channelId, cursor);
  }

  @Post('channels/:channelId/messages')
  create(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto
  ) {
    return this.messages.createMessage(user.id, channelId, dto);
  }

  @Patch('messages/:messageId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto
  ) {
    return this.messages.updateMessage(user.id, messageId, dto);
  }

  @Delete('messages/:messageId')
  remove(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string) {
    return this.messages.deleteMessage(user.id, messageId);
  }
}
