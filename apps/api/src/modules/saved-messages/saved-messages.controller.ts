import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateSavedMessageDto } from './dto/create-saved-message.dto';
import { SavedMessagesService } from './saved-messages.service';

@UseGuards(JwtAuthGuard)
@Controller('saved-messages')
export class SavedMessagesController {
  constructor(private readonly savedMessages: SavedMessagesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.savedMessages.list(user.id);
  }

  @RateLimit({ keyPrefix: 'saved-message-write', limit: 30, windowMs: 60_000 })
  @Post()
  async save(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSavedMessageDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, savedMessage } = await this.savedMessages.save(user.id, dto);
    // 201 for a new bookmark, 200 when the same message was already saved.
    response.status(created ? 201 : 200);
    return { savedMessage };
  }

  @RateLimit({ keyPrefix: 'saved-message-delete', limit: 30, windowMs: 60_000 })
  @Delete(':savedMessageId')
  remove(@CurrentUser() user: RequestUser, @Param('savedMessageId') savedMessageId: string) {
    return this.savedMessages.remove(user.id, savedMessageId);
  }
}
