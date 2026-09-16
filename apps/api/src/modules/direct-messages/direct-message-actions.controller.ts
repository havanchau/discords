import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { DirectMessageActionsService } from './direct-message-actions.service';
import { DirectMessageReactionDto } from './dto/direct-message-reaction.dto';
import { UpdateDirectMessageDto } from './dto/update-direct-message.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class DirectMessageActionsController {
  constructor(private readonly actions: DirectMessageActionsService) {}

  @Get('direct-conversations/:conversationId/pins')
  listPins(@CurrentUser() user: RequestUser, @Param('conversationId') conversationId: string) {
    return this.actions.listPins(user.id, conversationId);
  }

  @RateLimit({ keyPrefix: 'direct-message-update', limit: 30, windowMs: 60_000 })
  @Patch('direct-messages/:messageId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateDirectMessageDto,
  ) {
    return this.actions.updateMessage(user.id, messageId, dto);
  }

  @RateLimit({ keyPrefix: 'direct-message-delete', limit: 30, windowMs: 60_000 })
  @Delete('direct-messages/:messageId')
  remove(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string) {
    return this.actions.deleteMessage(user.id, messageId);
  }

  @RateLimit({ keyPrefix: 'direct-message-reaction', limit: 60, windowMs: 60_000 })
  @Post('direct-messages/:messageId/reactions')
  react(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: DirectMessageReactionDto,
  ) {
    return this.actions.toggleReaction(user.id, messageId, dto);
  }

  @RateLimit({ keyPrefix: 'direct-message-pin', limit: 30, windowMs: 60_000 })
  @Post('direct-messages/:messageId/pins')
  pin(@CurrentUser() user: RequestUser, @Param('messageId') messageId: string) {
    return this.actions.togglePin(user.id, messageId);
  }
}
