import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
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
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  byteSize!: number;

  @IsString()
  @MaxLength(1000)
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
