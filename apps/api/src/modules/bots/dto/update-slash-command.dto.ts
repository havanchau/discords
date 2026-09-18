import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SLASH_COMMAND_OPTIONS_MAX } from '@discord-clone/shared';
import { SlashCommandOptionDto } from './slash-command-option.dto';

/** `name` is immutable — delete and recreate to rename (see registry rules). */
export class UpdateSlashCommandDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SLASH_COMMAND_OPTIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => SlashCommandOptionDto)
  options?: SlashCommandOptionDto[];
}
