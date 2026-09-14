import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service';

describe('UploadsService (local driver)', () => {
  let root: string;
  let tmpDir: string;
  let localDir: string;
  let service: UploadsService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'uploads-service-'));
    tmpDir = join(root, 'tmp');
    localDir = join(root, 'stored');
    service = new UploadsService(
      new ConfigService({
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_DIR: localDir,
        UPLOAD_TMP_DIR: tmpDir,
        UPLOAD_MAX_BYTES: 1024,
        UPLOAD_CHUNK_BYTES: 16,
      }),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function tempUpload(name: string, content: string, mimetype: string) {
    const path = join(root, `${name}.upload`);
    await writeFile(path, content);
    return { path, originalname: name, mimetype, size: Buffer.byteLength(content) };
  }

  it('moves a single upload from its temp file into local storage', async () => {
    const file = await tempUpload('notes.txt', 'hello', 'text/plain');

    const attachment = await service.upload(file);

    const storedName = attachment.url.replace('/uploads/', '');
    assert.equal(await readFile(join(localDir, storedName), 'utf8'), 'hello');
    await assert.rejects(readFile(file.path), { code: 'ENOENT' });
  });

  it('removes the temp file when the file type is not allowed', async () => {
    const file = await tempUpload('tool.exe', 'MZ', 'application/octet-stream');

    await assert.rejects(service.upload(file), BadRequestException);

    await assert.rejects(readFile(file.path), { code: 'ENOENT' });
  });

  it('removes the temp file when the file is larger than the limit', async () => {
    const file = await tempUpload('big.txt', 'x'.repeat(2048), 'text/plain');

    await assert.rejects(service.upload(file), BadRequestException);

    await assert.rejects(readFile(file.path), { code: 'ENOENT' });
  });

  it('assembles chunks in index order and cleans the chunk directory', async () => {
    const parts = ['first-', 'second-', 'third'];
    const uploadId = 'upload-12345678';
    const metadata = {
      uploadId,
      totalChunks: parts.length,
      fileName: 'story.txt',
      mimeType: 'text/plain',
      fileSize: parts.join('').length,
    };

    // Arrive out of order to prove assembly follows chunkIndex, not arrival.
    await service.uploadChunk(chunk(parts[2]), { ...metadata, chunkIndex: 2 });
    await service.uploadChunk(chunk(parts[0]), { ...metadata, chunkIndex: 0 });
    const result = await service.uploadChunk(chunk(parts[1]), { ...metadata, chunkIndex: 1 });

    assert.equal(result.done, true);
    const storedName = result.attachment?.url.replace('/uploads/', '') ?? '';
    assert.equal(await readFile(join(localDir, storedName), 'utf8'), 'first-second-third');
    assert.deepEqual(await readdir(tmpDir), []);
  });
});

function chunk(content: string) {
  const buffer = Buffer.from(content);
  return { buffer, mimetype: 'text/plain', originalname: 'blob', size: buffer.length };
}
