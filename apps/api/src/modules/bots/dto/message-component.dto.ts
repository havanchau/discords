import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { ButtonStyle, MessageComponentType } from '@discord-clone/shared';
import {
  BUTTON_STYLES,
  MESSAGE_COMPONENT_CUSTOM_ID_MAX_LENGTH,
  MESSAGE_COMPONENT_LABEL_MAX_LENGTH,
  MESSAGE_COMPONENT_MAX_BUTTONS_PER_ROW,
  MESSAGE_COMPONENT_URL_MAX_LENGTH,
  SELECT_OPTIONS_MAX,
  SELECT_OPTIONS_MIN,
  SELECT_OPTION_DESCRIPTION_MAX_LENGTH,
  SELECT_OPTION_LABEL_MAX_LENGTH,
  SELECT_OPTION_VALUE_MAX_LENGTH,
  SELECT_PLACEHOLDER_MAX_LENGTH,
} from '@discord-clone/shared';

const COMPONENT_TYPES: MessageComponentType[] = ['BUTTON', 'SELECT'];

export class SelectOptionDto {
  @IsString()
  @MaxLength(SELECT_OPTION_LABEL_MAX_LENGTH)
  label!: string;

  @IsString()
  @MaxLength(SELECT_OPTION_VALUE_MAX_LENGTH)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(SELECT_OPTION_DESCRIPTION_MAX_LENGTH)
  description?: string;
}

/**
 * One component within a row: a button or a select menu. `class-validator` has no discriminated-union
 * support, so both shapes are declared on one DTO with every style/select-only field optional;
 * `validateComponentRows` (`../message-components.ts`) enforces which fields each `type` actually
 * requires, and the row-level composition rules (one select vs. up to 5 buttons, `customId`
 * uniqueness).
 */
export class MessageComponentDto {
  @IsIn(COMPONENT_TYPES)
  type!: MessageComponentType;

  // BUTTON-only
  @IsOptional()
  @IsIn(BUTTON_STYLES)
  style?: ButtonStyle;

  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_COMPONENT_LABEL_MAX_LENGTH)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_COMPONENT_URL_MAX_LENGTH)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  url?: string;

  // Shared by BUTTON (non-LINK) and SELECT.
  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_COMPONENT_CUSTOM_ID_MAX_LENGTH)
  customId?: string;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  // SELECT-only
  @IsOptional()
  @IsString()
  @MaxLength(SELECT_PLACEHOLDER_MAX_LENGTH)
  placeholder?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(SELECT_OPTIONS_MIN)
  @ArrayMaxSize(SELECT_OPTIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => SelectOptionDto)
  options?: SelectOptionDto[];
}

export class MessageComponentRowDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MESSAGE_COMPONENT_MAX_BUTTONS_PER_ROW)
  @ValidateNested({ each: true })
  @Type(() => MessageComponentDto)
  components!: MessageComponentDto[];
}
