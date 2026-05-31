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
import { memoryStorage } from 'multer';
import { RateLimit } from '../../common/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadsService } from './uploads.service';

const maxUploadBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
const maxChunkBytes = Number(process.env.UPLOAD_CHUNK_BYTES || 2 * 1024 * 1024);

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @RateLimit({ keyPrefix: 'upload-file', limit: 12, windowMs: 60_000 })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: maxUploadBytes },
      storage: memoryStorage(),
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

    if (file.size > this.uploads.maxUploadBytes) {
      throw new BadRequestException('File is too large');
    }

    if (!this.uploads.isAllowedFile(file)) {
      throw new BadRequestException('Unsupported file type');
    }

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
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      uploadId?: string;
      chunkIndex?: string;
      totalChunks?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Upload chunk is required');
    }

    return this.uploads.uploadChunk(file, {
      uploadId: body.uploadId,
      chunkIndex: Number(body.chunkIndex),
      totalChunks: Number(body.totalChunks),
      fileName: body.fileName || file.originalname,
      mimeType: body.mimeType || file.mimetype,
      fileSize: Number(body.fileSize),
    });
  }
}
