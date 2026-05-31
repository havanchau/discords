import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { randomUUID } from 'crypto';

const allowedMimeExtensions = new Map<string, string[]>([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['audio/mpeg', ['.mp3']],
  ['audio/mp4', ['.m4a', '.mp4']],
  ['audio/ogg', ['.ogg']],
  ['audio/wav', ['.wav']],
  ['audio/webm', ['.webm']],
  ['video/mp4', ['.mp4']],
  ['video/webm', ['.webm']],
  ['application/pdf', ['.pdf']],
  ['text/plain', ['.txt']],
  ['application/zip', ['.zip']],
]);

function normalizeMimeType(mimeType: string) {
  return mimeType.split(';')[0].trim().toLowerCase();
}

function detectAllowedMimeType(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>) {
  const normalizedMimeType = normalizeMimeType(file.mimetype);
  const extension = extname(file.originalname).toLowerCase();
  const allowedExtensions = allowedMimeExtensions.get(normalizedMimeType);

  if (allowedExtensions?.includes(extension)) {
    return normalizedMimeType;
  }

  for (const [mimeType, extensions] of allowedMimeExtensions) {
    if (extensions.includes(extension)) {
      return mimeType;
    }
  }

  return null;
}

export type IncomingUploadFile = Pick<
  Express.Multer.File,
  'buffer' | 'mimetype' | 'originalname' | 'size'
>;

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {
    if (this.storageDriver === 'cloudinary') {
      cloudinary.config({
        cloud_name: this.requiredConfig('CLOUDINARY_CLOUD_NAME'),
        api_key: this.requiredConfig('CLOUDINARY_API_KEY'),
        api_secret: this.requiredConfig('CLOUDINARY_API_SECRET'),
        secure: true,
      });
    }
  }

  get maxUploadBytes() {
    return this.config.get<number>('UPLOAD_MAX_BYTES', 10 * 1024 * 1024);
  }

  isAllowedFile(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>) {
    return Boolean(detectAllowedMimeType(file));
  }

  async upload(file: IncomingUploadFile) {
    const extension = this.safeExtension(file);
    const mimeType = detectAllowedMimeType(file) ?? normalizeMimeType(file.mimetype);
    const fileName = basename(file.originalname).slice(0, 255);
    const key = this.buildStorageKey(extension);
    const url =
      this.storageDriver === 'cloudinary'
        ? await this.uploadToCloudinary(file, key, mimeType)
        : this.uploadToLocal(file, key);

    return {
      fileName,
      mimeType,
      byteSize: file.size,
      url,
    };
  }

  private get storageDriver() {
    return this.config.get<string>('STORAGE_DRIVER', 'local').toLowerCase();
  }

  private buildStorageKey(extension: string) {
    const prefix = this.config
      .get<string>('CLOUDINARY_FOLDER', 'discord-clone/uploads')
      .replace(/^\/+|\/+$/g, '');
    return `${prefix}/${randomUUID()}${extension}`;
  }

  private uploadToLocal(file: IncomingUploadFile, key: string) {
    const localDir = this.config.get<string>('STORAGE_LOCAL_DIR', 'uploads');
    const fileName = key.split('/').pop();

    if (!fileName) {
      throw new InternalServerErrorException('Cannot create upload file name');
    }

    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    writeFileSync(join(localDir, fileName), file.buffer);
    return `/uploads/${fileName}`;
  }

  private async uploadToCloudinary(file: IncomingUploadFile, key: string, mimeType: string) {
    const resourceType = this.cloudinaryResourceType(mimeType);
    const publicId = resourceType === 'raw' ? key : key.replace(/\.[^.]+$/, '');

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: resourceType,
          overwrite: false,
          use_filename: false,
          unique_filename: false,
        },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          resolve(response);
        },
      );

      stream.end(file.buffer);
    }).catch((error) => {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Cloudinary upload failed',
      );
    });

    return result.secure_url;
  }

  private cloudinaryResourceType(mimeType: string) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'video';
    if (mimeType.startsWith('video/')) return 'video';
    return 'raw';
  }

  private safeExtension(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>) {
    const extension = extname(file.originalname).toLowerCase();
    const mimeType = detectAllowedMimeType(file) ?? normalizeMimeType(file.mimetype);
    const allowedExtensions = allowedMimeExtensions.get(mimeType) ?? [];
    return allowedExtensions.includes(extension) ? extension : (allowedExtensions[0] ?? '');
  }

  private requiredConfig(key: string) {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`${key} is required for Cloudinary uploads`);
    }
    return value;
  }
}
