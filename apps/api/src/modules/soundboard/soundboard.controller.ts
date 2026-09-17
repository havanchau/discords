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
import { SOUNDBOARD_CLIP_MAX_BYTES } from '@discord-clone/shared';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateSoundboardClipDto } from './dto/create-soundboard-clip.dto';
import { SoundboardService } from './soundboard.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/soundboard')
export class SoundboardController {
  constructor(private readonly soundboard: SoundboardService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.soundboard.list(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'soundboard-create', limit: 20, windowMs: 60_000 })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: SOUNDBOARD_CLIP_MAX_BYTES, files: 1 },
    }),
  )
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateSoundboardClipDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.soundboard.create(user.id, serverId, dto, file);
  }

  @RateLimit({ keyPrefix: 'soundboard-delete', limit: 20, windowMs: 60_000 })
  @Delete(':clipId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('clipId') clipId: string,
  ) {
    return this.soundboard.remove(user.id, serverId, clipId);
  }
}
