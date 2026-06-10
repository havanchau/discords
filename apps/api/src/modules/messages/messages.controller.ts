import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReactionDto } from './dto/reaction.dto';
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
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('in') inChannel?: string,
    @Query('hasLink') hasLink?: string,
    @Query('hasFile') hasFile?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.messages.listMessages(user.id, channelId, cursor, {
      search,
      from,
      inChannel,
      hasLink: hasLink === 'true',
      hasFile: hasFile === 'true',
      before,
      after,
    });
  }

  @Get('channels/:channelId/pins')
  listPins(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.messages.listPinnedMessages(user.id, channelId);
  }

  @Post('channels/:channelId/read')
  markRead(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: { messageId?: string },
  ) {
    return this.messages.markChannelRead(user.id, channelId, dto.messageId);
  }

  @RateLimit({ keyPrefix: 'message-create', limit: 30, windowMs: 60_000 })
  @Post('channels/:channelId/messages')
  create(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messages.createMessage(user.id, channelId, dto);
  }

  @Patch('messages/:messageId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.updateMessage(user.id, messageId, dto);
  }

  @Delete('messages/:messageId')
  remove(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string) {
    return this.messages.deleteMessage(user.id, messageId);
  }

  @RateLimit({ keyPrefix: 'reaction-toggle', limit: 60, windowMs: 60_000 })
  @Post('messages/:messageId/reactions')
  react(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: ReactionDto,
  ) {
    return this.messages.toggleReaction(user.id, messageId, dto);
  }

  @Post('messages/:messageId/pins')
  pin(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string) {
    return this.messages.togglePin(user.id, messageId);
  }
}
