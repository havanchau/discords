import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { ForwardingService } from './forwarding.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ForwardingController {
  constructor(private readonly forwarding: ForwardingService) {}

  @RateLimit({ keyPrefix: 'message-forward', limit: 20, windowMs: 60_000 })
  @Post('messages/:messageId/forward')
  forwardChannelMessage(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.forwarding.forwardChannelMessage(user.id, messageId, dto);
  }

  @RateLimit({ keyPrefix: 'message-forward', limit: 20, windowMs: 60_000 })
  @Post('direct-messages/:messageId/forward')
  forwardDirectMessage(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.forwarding.forwardDirectMessage(user.id, messageId, dto);
  }
}
