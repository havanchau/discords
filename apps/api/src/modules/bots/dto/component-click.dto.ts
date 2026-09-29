import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MESSAGE_COMPONENT_CUSTOM_ID_MAX_LENGTH,
  SELECT_OPTIONS_MAX,
  SELECT_OPTION_VALUE_MAX_LENGTH,
} from '@discord-clone/shared';

/** `POST /messages/:messageId/component-interactions` body (session auth, a human member's click). */
export class ComponentClickDto {
  @IsString()
  @MaxLength(MESSAGE_COMPONENT_CUSTOM_ID_MAX_LENGTH)
  customId!: string;

  /** The select's chosen values; omitted/ignored for a button. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SELECT_OPTIONS_MAX)
  @IsString({ each: true })
  @MaxLength(SELECT_OPTION_VALUE_MAX_LENGTH, { each: true })
  values?: string[];
}
