import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { SavedMessageSourceType } from '@prisma/client';

export class CreateSavedMessageDto {
  @IsIn(['CHANNEL', 'DIRECT'])
  sourceType!: SavedMessageSourceType;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  messageId!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  remindAt?: string;
}
