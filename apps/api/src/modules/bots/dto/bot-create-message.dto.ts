import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_COMPONENT_MAX_ROWS } from '@discord-clone/shared';
import { MessageComponentRowDto } from './message-component.dto';

/**
 * A bot's channel message. Text, an optional reply, and optional buttons/select menus
 * (`bot-message-components.md`). Attachments need the upload route, which is not on the bot allowlist
 * in phase 1, so that field is refused like any other unknown one.
 */
export class BotCreateMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MESSAGE_COMPONENT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => MessageComponentRowDto)
  components?: MessageComponentRowDto[];
}
