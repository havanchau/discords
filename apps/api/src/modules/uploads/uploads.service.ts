import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { randomUUID } from 'crypto';

/** An abandoned resumable upload leaves its chunks behind; they are swept on the next chunk write. */
const CHUNK_DIR_TTL_MS = 6 * 60 * 60 * 1000;

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

export type IncomingUploadChunk = Pick<
  Express.Multer.File,
  'buffer' | 'mimetype' | 'originalname' | 'size'
>;

/** A single-request upload that multer has already streamed to a temp file. */
export type IncomingDiskUpload = Pick<
  Express.Multer.File,
  'path' | 'mimetype' | 'originalname' | 'size'
>;

/** Ids come from the database, but they still become path segments, so they are checked here too. */
function safePathSegment(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new InternalServerErrorException('Cannot build upload path');
  }
  return value;
}

function hasErrorCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function readChunk(chunkPath: string) {
  try {
    return await readFile(chunkPath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      throw new BadRequestException('Upload chunk is missing');
    }
    throw error;
  }
}

// rename() cannot cross filesystems; UPLOAD_TMP_DIR and STORAGE_LOCAL_DIR may be different mounts.
async function moveFile(sourcePath: string, targetPath: string) {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (!hasErrorCode(error, 'EXDEV')) throw error;
    await copyFile(sourcePath, targetPath);
    await rm(sourcePath, { force: true });
  }
}

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

  /** One spare chunk so a client whose chunk size does not divide the limit evenly still fits. */
  get maxChunkCount() {
    return Math.ceil(this.maxUploadBytes / this.maxChunkBytes) + 1;
  }

  isAllowedFile(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>) {
    return Boolean(detectAllowedMimeType(file));
  }

  private get uploadTmpDir() {
    return this.config.get<string>('UPLOAD_TMP_DIR', join('uploads', '.chunks'));
  }

  async upload(file: IncomingDiskUpload) {
    try {
      if (file.size > this.maxUploadBytes) {
        throw new BadRequestException('File is too large');
      }
      if (!this.isAllowedFile(file)) {
        throw new BadRequestException('Unsupported file type');
      }
      return await this.uploadFromPath(file);
    } catch (error) {
      await rm(file.path, { force: true });
      throw error;
    }
  }

  /**
   * Stores a small asset multer held in memory (sticker, soundboard clip). The caller has already
   * sniffed the bytes and passes the detected type with a matching server-built file name.
   */
  async uploadBuffer(file: IncomingUploadChunk) {
    if (file.buffer.length > this.maxUploadBytes) {
      throw new BadRequestException('File is too large');
    }
    if (!this.isAllowedFile(file)) {
      throw new BadRequestException('Unsupported file type');
    }
    await mkdir(this.uploadTmpDir, { recursive: true });
    const tempPath = join(this.uploadTmpDir, `${randomUUID()}.upload`);
    await writeFile(tempPath, file.buffer);
    try {
      return await this.uploadFromPath({
        path: tempPath,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.buffer.length,
      });
    } finally {
      // Local storage already moved the file; this only cleans up after a failed upload.
      await rm(tempPath, { force: true });
    }
  }

  async uploadChunk(
    userId: string,
    file: IncomingUploadChunk,
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

    // Without this cap the declared chunk count alone decides how much disk a caller can claim:
    // `fileSize` is client-supplied and never matches the bytes actually written.
    if (totalChunks > this.maxChunkCount) {
      throw new BadRequestException('Too many upload chunks');
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
      mimetype: normalizedMimeType,
      originalname: fileName,
      size: fileSize,
    };

    if (!this.isAllowedFile(candidate)) {
      throw new BadRequestException('Unsupported file type');
    }

    const uploadDir = this.chunkUploadDir(userId, uploadId);
    await this.sweepExpiredChunkDirs(userId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, `${chunkIndex}.part`), file.buffer);
    const receivedChunks = (await readdir(uploadDir)).filter((name) =>
      name.endsWith('.part'),
    ).length;

    if (receivedChunks < totalChunks) {
      return {
        uploadId,
        receivedChunks,
        totalChunks,
        done: false,
      };
    }

    try {
      const assembledPath = join(uploadDir, fileName);
      await this.assembleChunks(uploadDir, totalChunks, assembledPath);
      // The real size is only known once the chunks are joined; `fileSize` was just a claim.
      const assembledSize = (await stat(assembledPath)).size;

      if (assembledSize > this.maxUploadBytes) {
        throw new BadRequestException('File is too large');
      }

      const attachment = await this.uploadFromPath({
        path: assembledPath,
        originalname: fileName,
        mimetype: normalizedMimeType,
        size: assembledSize,
      });

      return {
        uploadId,
        receivedChunks,
        totalChunks,
        done: true,
        attachment,
      };
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
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

  // One chunk buffer in memory at a time, written with async I/O so the event loop stays free.
  private async assembleChunks(uploadDir: string, totalChunks: number, assembledPath: string) {
    const output = await open(assembledPath, 'w');
    try {
      for (let index = 0; index < totalChunks; index += 1) {
        await output.write(await readChunk(join(uploadDir, `${index}.part`)));
      }
    } finally {
      await output.close();
    }
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
        : await this.uploadPathToLocal(file.path, key);

    return {
      fileName,
      mimeType,
      byteSize: file.size,
      url,
    };
  }

  private async uploadPathToLocal(sourcePath: string, key: string) {
    const localDir = this.config.get<string>('STORAGE_LOCAL_DIR', 'uploads');
    const fileName = key.split('/').pop();

    if (!fileName) {
      throw new InternalServerErrorException('Cannot create upload file name');
    }

    await mkdir(localDir, { recursive: true });
    await moveFile(sourcePath, join(localDir, fileName));
    return `/uploads/${fileName}`;
  }

  private async uploadPathToCloudinary(path: string, key: string, mimeType: string) {
    const resourceType = this.cloudinaryResourceType(mimeType);
    const publicId = resourceType === 'raw' ? key : key.replace(/\.[^.]+$/, '');

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      void cloudinary.uploader.upload_large(
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
            reject(new Error('Cloudinary upload failed', { cause: error }));
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

    await rm(path, { force: true });
    return result.secure_url;
  }

  /** Scoped by user so one caller can never write into another caller's in-progress upload. */
  private chunkUploadDir(userId: string, uploadId: string) {
    return join(this.uploadTmpDir, safePathSegment(userId), uploadId);
  }

  private async sweepExpiredChunkDirs(userId: string) {
    const userDir = join(this.uploadTmpDir, safePathSegment(userId));
    let entries: string[];

    try {
      entries = await readdir(userDir);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) return;
      throw error;
    }

    const expiresBefore = Date.now() - CHUNK_DIR_TTL_MS;
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(userDir, entry);
        const stats = await stat(entryPath).catch(() => null);
        if (stats && stats.mtimeMs < expiresBefore) {
          await rm(entryPath, { recursive: true, force: true });
        }
      }),
    );
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
