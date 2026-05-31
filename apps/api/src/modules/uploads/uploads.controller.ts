import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { basename, extname } from 'path';
import { randomUUID } from 'crypto';
import { RateLimit } from '../../common/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const mimeExtensionMap = new Map<string, string[]>([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['video/mp4', ['.mp4']],
  ['video/webm', ['.webm']],
  ['application/pdf', ['.pdf']],
  ['text/plain', ['.txt']],
  ['application/zip', ['.zip']]
]);

const maxUploadBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);

type IncomingUploadFile = Pick<Express.Multer.File, 'mimetype' | 'originalname'>;

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly config: ConfigService) {}

  @RateLimit({ keyPrefix: 'upload-file', limit: 12, windowMs: 60_000 })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: maxUploadBytes },
      storage: diskStorage({
        destination: 'uploads',
        filename: (_request, file, callback) => {
          const extension = safeExtension(file);
          callback(null, `${randomUUID()}${extension}`);
        }
      }),
      fileFilter: (_request, file, callback) => {
        if (!isAllowedFile(file)) {
          callback(new BadRequestException('Unsupported file type'), false);
          return;
        }
        callback(null, true);
      }
    })
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > this.config.get<number>('UPLOAD_MAX_BYTES', maxUploadBytes)) {
      throw new BadRequestException('File is too large');
    }

    return {
      attachment: {
        fileName: basename(file.originalname).slice(0, 255),
        mimeType: file.mimetype,
        byteSize: file.size,
        url: `/uploads/${file.filename}`
      }
    };
  }
}

function isAllowedFile(file: IncomingUploadFile) {
  const allowedExtensions = mimeExtensionMap.get(file.mimetype);
  if (!allowedExtensions) return false;
  const extension = extname(file.originalname).toLowerCase();
  return allowedExtensions.includes(extension);
}

function safeExtension(file: IncomingUploadFile) {
  const extension = extname(file.originalname).toLowerCase();
  const allowedExtensions = mimeExtensionMap.get(file.mimetype) ?? [];
  return allowedExtensions.includes(extension) ? extension : allowedExtensions[0] ?? '';
}
