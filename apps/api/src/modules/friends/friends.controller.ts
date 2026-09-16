import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BlockUserDto } from './dto/block-user.dto';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { FriendsService } from './friends.service';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.friends.list(user.id);
  }

  @RateLimit({ keyPrefix: 'friend-request', limit: 12, windowMs: 60_000 })
  @Post('requests')
  request(@CurrentUser() user: RequestUser, @Body() dto: CreateFriendRequestDto) {
    return this.friends.request(user.id, dto);
  }

  @Patch('requests/:requestId')
  respond(
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
    @Body() dto: RespondFriendRequestDto,
  ) {
    return this.friends.respond(user.id, requestId, dto);
  }

  @Delete('requests/:requestId')
  remove(@CurrentUser() user: RequestUser, @Param('requestId') requestId: string) {
    return this.friends.remove(user.id, requestId);
  }

  @RateLimit({ keyPrefix: 'user-block', limit: 30, windowMs: 60_000 })
  @Post('blocks')
  block(@CurrentUser() user: RequestUser, @Body() dto: BlockUserDto) {
    return this.friends.block(user.id, dto.userId);
  }

  @Delete('blocks/:userId')
  unblock(@CurrentUser() user: RequestUser, @Param('userId') blockedUserId: string) {
    return this.friends.unblock(user.id, blockedUserId);
  }

  @Post(':userId/dm')
  startDm(@CurrentUser() user: RequestUser, @Param('userId') friendUserId: string) {
    return this.friends.startDm(user.id, friendUserId);
  }
}
