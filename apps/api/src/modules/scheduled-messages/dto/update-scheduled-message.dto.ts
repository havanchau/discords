import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_DIRECT_MESSAGE_ATTACHMENTS } from '@/modules/direct-messages/dto/create-direct-message.dto';
import { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';

export class UpdateScheduledMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DIRECT_MESSAGE_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];

  @IsOptional()
  @IsISO8601({ strict: true })
  sendAt?: string;
}
