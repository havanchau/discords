import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { randomBytes } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadsService } from './uploads.service';

/** A key is always generated here; the check keeps any other value from becoming a path segment. */
const PRIVATE_KEY_PATTERN = /^[a-z-]{1,40}\/[a-f0-9]{48}\.json$/;

function requireKey(key: string) {
  if (!PRIVATE_KEY_PATTERN.test(key)) {
    throw new InternalServerErrorException('Invalid private file key');
  }
  return key;
}

/**
 * Files only their owner may read, such as data exports. Unlike `UploadsService`, nothing here is
 * public: the local driver writes outside the statically served `uploads` directory, and the
 * Cloudinary driver stores `authenticated` raw resources. Callers serve the bytes through a route
 * that has already checked ownership.
 */
@Injectable()
export class PrivateFileStorageService {
  private readonly logger = new Logger(PrivateFileStorageService.name);

  // UploadsService is injected so its constructor has configured the Cloudinary SDK before use.
  constructor(
    private readonly config: ConfigService,
    readonly uploads: UploadsService,
  ) {}

  /** Returns the generated key, the only handle to the stored file. */
  async store(prefix: string, content: string) {
    const key = requireKey(`${prefix}/${randomBytes(24).toString('hex')}.json`);
    if (this.isCloudinary) {
      await this.storeInCloudinary(key, Buffer.from(content, 'utf8'));
    } else {
      const path = this.localPath(key);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, content, { encoding: 'utf8', mode: 0o600 });
    }
    return key;
  }

  async read(key: string) {
    if (!this.isCloudinary) return readFile(this.localPath(key));
    const signedUrl = cloudinary.url(this.cloudinaryPublicId(key), {
      resource_type: 'raw',
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new InternalServerErrorException('Private file could not be read');
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(key: string) {
    if (!this.isCloudinary) {
      await rm(this.localPath(key), { force: true });
      return;
    }
    await cloudinary.uploader.destroy(this.cloudinaryPublicId(key), {
      resource_type: 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  }

  /** For cleanup after a commit: a failure leaves an orphaned file, which is logged by key only. */
  async removeQuietly(key: string) {
    try {
      await this.remove(key);
    } catch (error) {
      this.logger.error(
        `Private file ${key} could not be removed`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private get isCloudinary() {
    return this.config.get<string>('STORAGE_DRIVER', 'local').toLowerCase() === 'cloudinary';
  }

  /** Defaults to the OS temp directory, outside the repository and the public uploads directory. */
  private localPath(key: string) {
    const root = this.config.get<string>(
      'PRIVATE_STORAGE_LOCAL_DIR',
      join(tmpdir(), 'discord-clone-private'),
    );
    return join(root, requireKey(key));
  }

  private cloudinaryPublicId(key: string) {
    const folder = this.config
      .get<string>('CLOUDINARY_FOLDER', 'discord-clone/uploads')
      .replace(/^\/+|\/+$/g, '');
    return `${folder}/private/${requireKey(key)}`;
  }

  private async storeInCloudinary(key: string, content: Buffer) {
    await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: this.cloudinaryPublicId(key),
          resource_type: 'raw',
          type: 'authenticated',
          overwrite: false,
        },
        (error, response) => {
          if (error || !response) {
            reject(new Error('Cloudinary private upload failed', { cause: error }));
            return;
          }
          resolve(response);
        },
      );
      stream.end(content);
    });
  }
}
