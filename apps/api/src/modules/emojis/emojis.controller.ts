import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateEmojiDto } from './dto/create-emoji.dto';
import { EmojisService } from './emojis.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/emojis')
export class EmojisController {
  constructor(private readonly emojis: EmojisService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.emojis.list(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'emoji-create', limit: 20, windowMs: 60_000 })
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateEmojiDto,
  ) {
    return this.emojis.create(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'emoji-delete', limit: 20, windowMs: 60_000 })
  @Delete(':emojiId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('emojiId') emojiId: string,
  ) {
    return this.emojis.remove(user.id, serverId, emojiId);
  }
}
