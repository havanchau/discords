import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
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

  get maxChunkBytes() {
    return this.config.get<number>('UPLOAD_CHUNK_BYTES', 2 * 1024 * 1024);
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

  async uploadChunk(
    file: IncomingUploadFile,
    metadata: {
      uploadId?: string;
      chunkIndex: number;
      totalChunks: number;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
  ) {
    const uploadId = this.safeUploadId(metadata.uploadId || randomUUID());
    const fileName = basename(metadata.fileName).slice(0, 255);
    const chunkIndex = Number(metadata.chunkIndex);
    const totalChunks = Number(metadata.totalChunks);
    const fileSize = Number(metadata.fileSize);

    if (!Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || totalChunks < 1) {
      throw new BadRequestException('Invalid upload chunk metadata');
    }

    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new BadRequestException('Invalid upload chunk index');
    }

    if (file.size > this.maxChunkBytes) {
      throw new BadRequestException('Upload chunk is too large');
    }

    if (fileSize > this.maxUploadBytes) {
      throw new BadRequestException('File is too large');
    }

    const normalizedMimeType = normalizeMimeType(metadata.mimeType || file.mimetype);
    const candidate = {
      buffer: file.buffer,
      mimetype: normalizedMimeType,
      originalname: fileName,
      size: fileSize,
    };

    if (!this.isAllowedFile(candidate)) {
      throw new BadRequestException('Unsupported file type');
    }

    const uploadDir = this.chunkUploadDir(uploadId);
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    writeFileSync(join(uploadDir, `${chunkIndex}.part`), file.buffer);
    const receivedChunks = readdirSync(uploadDir).filter((name) => name.endsWith('.part')).length;

    if (receivedChunks < totalChunks) {
      return {
        uploadId,
        receivedChunks,
        totalChunks,
        done: false,
      };
    }

    const assembledPath = join(uploadDir, fileName);
    if (existsSync(assembledPath)) {
      unlinkSync(assembledPath);
    }
    for (let index = 0; index < totalChunks; index += 1) {
      const chunkPath = join(uploadDir, `${index}.part`);
      if (!existsSync(chunkPath)) {
        throw new BadRequestException('Upload chunk is missing');
      }
      appendFileSync(assembledPath, readFileSync(chunkPath));
    }

    const attachment = await this.uploadFromPath({
      path: assembledPath,
      originalname: fileName,
      mimetype: normalizedMimeType,
      size: fileSize,
    });
    rmSync(uploadDir, { recursive: true, force: true });

    return {
      uploadId,
      receivedChunks,
      totalChunks,
      done: true,
      attachment,
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

  private async uploadFromPath(file: {
    path: string;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    const extension = this.safeExtension(file);
    const mimeType = detectAllowedMimeType(file) ?? normalizeMimeType(file.mimetype);
    const fileName = basename(file.originalname).slice(0, 255);
    const key = this.buildStorageKey(extension);
    const url =
      this.storageDriver === 'cloudinary'
        ? await this.uploadPathToCloudinary(file.path, key, mimeType)
        : this.uploadPathToLocal(file.path, key);

    return {
      fileName,
      mimeType,
      byteSize: file.size,
      url,
    };
  }

  private uploadPathToLocal(sourcePath: string, key: string) {
    const localDir = this.config.get<string>('STORAGE_LOCAL_DIR', 'uploads');
    const fileName = key.split('/').pop();

    if (!fileName) {
      throw new InternalServerErrorException('Cannot create upload file name');
    }

    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    const targetPath = join(localDir, fileName);
    renameSync(sourcePath, targetPath);
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

  private async uploadPathToCloudinary(path: string, key: string, mimeType: string) {
    const resourceType = this.cloudinaryResourceType(mimeType);
    const publicId = resourceType === 'raw' ? key : key.replace(/\.[^.]+$/, '');

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload_large(
        path,
        {
          public_id: publicId,
          resource_type: resourceType,
          overwrite: false,
          use_filename: false,
          unique_filename: false,
          chunk_size: this.maxChunkBytes,
        },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          resolve(response);
        },
      );
    }).catch((error) => {
        throw new InternalServerErrorException(
          error instanceof Error ? error.message : 'Cloudinary upload failed',
        );
      });

    unlinkSync(path);
    return result.secure_url;
  }

  private chunkUploadDir(uploadId: string) {
    const tmpDir = this.config.get<string>('UPLOAD_TMP_DIR', join('uploads', '.chunks'));
    return join(tmpDir, uploadId);
  }

  private safeUploadId(uploadId: string) {
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(uploadId)) {
      throw new BadRequestException('Invalid upload id');
    }
    return uploadId;
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
