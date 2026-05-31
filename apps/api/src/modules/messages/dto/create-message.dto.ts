import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageAttachmentInputDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  @IsIn([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'application/pdf',
    'text/plain',
    'application/zip'
  ])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  byteSize!: number;

  @IsString()
  @MaxLength(1000)
  @Matches(/^\/uploads\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|gif|webp|mp4|webm|pdf|txt|zip)$/i, {
    message: 'Attachment URL must reference an uploaded local file'
  })
  url!: string;
}

export class CreateMessageDto {
  @IsString()
  @MaxLength(4000)
  content = '';

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];
}
