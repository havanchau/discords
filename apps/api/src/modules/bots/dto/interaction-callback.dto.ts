import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_COMPONENT_MAX_ROWS } from '@discord-clone/shared';
import { MessageComponentRowDto } from './message-component.dto';

const CALLBACK_TYPES = ['MESSAGE', 'UPDATE_MESSAGE'] as const;

/**
 * `POST /bot-api/interactions/:interactionToken/callback` body
 * (`bot-message-components.md` → Changes, step 7). Replaces reusing `BotCreateMessageDto` directly:
 * `type` picks between posting a new message (unchanged default behavior) and editing the message
 * the component lived on. `content` is required only for `type: 'MESSAGE'`; that requirement is
 * enforced in `InteractionsService`, not here, since it depends on `type`.
 */
export class InteractionCallbackDto {
  @IsOptional()
  @IsIn(CALLBACK_TYPES)
  type?: (typeof CALLBACK_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

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
