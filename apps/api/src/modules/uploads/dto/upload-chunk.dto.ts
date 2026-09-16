import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Multipart fields arrive as strings, so numbers are coerced with @Type before validation.
 * `uploadId` is only the caller's handle on a resumable upload; the storage path is derived
 * from it together with the authenticated user id, never from it alone.
 */
export class UploadChunkDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{8,80}$/, { message: 'Invalid upload id' })
  uploadId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkIndex!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalChunks!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize!: number;
}
