import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { UploadWrappedKeysDto } from './dto/upload-wrapped-keys.dto';
import { WrappedKeyQueryDto } from './dto/wrapped-key-query.dto';
import { EncryptionKeysService } from './encryption-keys.service';

/**
 * Conversation routes live under `direct-conversations`, where the repo's other DM routes already
 * are, rather than the spec's shorthand `conversations`.
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class EncryptionKeysController {
  constructor(private readonly keys: EncryptionKeysService) {}

  @RateLimit({ keyPrefix: 'encryption-keys-upload', limit: 60, windowMs: 60_000 })
  @Post('channels/:channelId/encryption/keys')
  uploadChannelKeys(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: UploadWrappedKeysDto,
  ) {
    return this.keys.uploadChannelKeys(user.id, channelId, dto);
  }

  @Get('channels/:channelId/encryption/keys')
  getChannelKey(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Query() query: WrappedKeyQueryDto,
  ) {
    return this.keys.getChannelKey(user.id, channelId, query);
  }

  @Get('channels/:channelId/encryption/pending-wraps')
  channelPendingWraps(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.keys.channelPendingWraps(user.id, channelId);
  }

  @RateLimit({ keyPrefix: 'encryption-keys-upload', limit: 60, windowMs: 60_000 })
  @Post('direct-conversations/:conversationId/encryption/keys')
  uploadConversationKeys(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: UploadWrappedKeysDto,
  ) {
    return this.keys.uploadConversationKeys(user.id, conversationId, dto);
  }

  @Get('direct-conversations/:conversationId/encryption/keys')
  getConversationKey(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Query() query: WrappedKeyQueryDto,
  ) {
    return this.keys.getConversationKey(user.id, conversationId, query);
  }

  @Get('direct-conversations/:conversationId/encryption/pending-wraps')
  conversationPendingWraps(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.keys.conversationPendingWraps(user.id, conversationId);
  }
}
