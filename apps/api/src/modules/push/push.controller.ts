import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeletePushSubscriptionDto, SavePushSubscriptionDto } from './dto/push-subscription.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  publicKey() {
    return { publicKey: this.push.getPublicKey() };
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  subscribe(@CurrentUser() user: RequestUser, @Body() dto: SavePushSubscriptionDto) {
    return this.push.saveSubscription(user.id, dto.subscription, dto.deviceName);
  }

  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  unsubscribe(@CurrentUser() user: RequestUser, @Body() dto: DeletePushSubscriptionDto) {
    return this.push.deleteSubscription(user.id, dto.endpoint);
  }
}
