import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FORUM_POST_MAX_TAGS, FORUM_POST_TITLE_MAX_LENGTH } from '@discord-clone/shared';
import { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';

export class CreateForumPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(FORUM_POST_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(FORUM_POST_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tagIds?: string[];

  @IsString()
  @MaxLength(4000)
  content = '';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];
}
