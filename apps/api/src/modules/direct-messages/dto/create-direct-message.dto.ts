import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';

export const MAX_DIRECT_MESSAGE_ATTACHMENTS = 10;

export class CreateDirectMessageDto {
  @IsString()
  @MaxLength(4000)
  content = '';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToMessageId?: string;

  // Same URL allowlist as channel attachments: only files that went through the uploads module.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DIRECT_MESSAGE_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];
}
