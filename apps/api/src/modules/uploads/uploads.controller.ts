import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import { diskStorage, memoryStorage } from 'multer';
import { join } from 'path';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadChunkDto } from './dto/upload-chunk.dto';
import { UploadsService } from './uploads.service';

const maxUploadBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
const maxChunkBytes = Number(process.env.UPLOAD_CHUNK_BYTES || 2 * 1024 * 1024);
const uploadTmpDir = process.env.UPLOAD_TMP_DIR || join('uploads', '.chunks');

// Whole files go to disk so a request never holds up to UPLOAD_MAX_BYTES in memory.
// The temp name is server-generated; the client file name is never used as a path.
const tempFileStorage = diskStorage({
  destination: (_request, _file, callback) => {
    mkdir(uploadTmpDir, { recursive: true }).then(
      () => callback(null, uploadTmpDir),
      (error: Error) => callback(error, uploadTmpDir),
    );
  },
  filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
});

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @RateLimit({ keyPrefix: 'upload-file', limit: 12, windowMs: 60_000 })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: maxUploadBytes },
      storage: tempFileStorage,
      fileFilter: (_request, file, callback) => {
        const allowedExtensions = new Set([
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.webp',
          '.mp3',
          '.m4a',
          '.ogg',
          '.wav',
          '.mp4',
          '.webm',
          '.pdf',
          '.txt',
          '.zip',
        ]);
        const hasAllowedExtension = [...allowedExtensions].some((extension) =>
          file.originalname.toLowerCase().endsWith(extension),
        );

        if (!hasAllowedExtension) {
          callback(new BadRequestException('Unsupported file type'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Size and MIME checks run in the service so the temp file is removed when they fail.
    return { attachment: await this.uploads.upload(file) };
  }

  @RateLimit({ keyPrefix: 'upload-chunk', limit: 180, windowMs: 60_000 })
  @Post('chunks')
  @UseInterceptors(
    FileInterceptor('chunk', {
      limits: { fileSize: maxChunkBytes },
      storage: memoryStorage(),
    }),
  )
  async uploadChunk(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadChunkDto,
  ) {
    if (!file) {
      throw new BadRequestException('Upload chunk is required');
    }

    return this.uploads.uploadChunk(user.id, file, {
      uploadId: body.uploadId,
      chunkIndex: body.chunkIndex,
      totalChunks: body.totalChunks,
      fileName: body.fileName || file.originalname,
      mimeType: body.mimeType || file.mimetype,
      fileSize: body.fileSize,
    });
  }
}
