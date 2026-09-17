import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { STICKER_MAX_BYTES } from '@discord-clone/shared';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateStickerDto } from './dto/create-sticker.dto';
import { StickersService } from './stickers.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/stickers')
export class StickersController {
  constructor(private readonly stickers: StickersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.stickers.list(user.id, serverId);
  }

  // The file is small enough to hold in memory; multer refuses anything over the sticker cap before
  // the service reads a byte of it.
  @RateLimit({ keyPrefix: 'sticker-create', limit: 20, windowMs: 60_000 })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: STICKER_MAX_BYTES, files: 1 },
    }),
  )
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateStickerDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.stickers.create(user.id, serverId, dto, file);
  }

  @RateLimit({ keyPrefix: 'sticker-delete', limit: 20, windowMs: 60_000 })
  @Delete(':stickerId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('stickerId') stickerId: string,
  ) {
    return this.stickers.remove(user.id, serverId, stickerId);
  }
}
