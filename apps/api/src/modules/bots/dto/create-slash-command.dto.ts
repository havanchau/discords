import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SLASH_COMMAND_NAME_PATTERN, SLASH_COMMAND_OPTIONS_MAX } from '@discord-clone/shared';
import { SlashCommandOptionDto } from './slash-command-option.dto';

export class CreateSlashCommandDto {
  @IsString()
  @Matches(SLASH_COMMAND_NAME_PATTERN, {
    message: 'Command name must be lowercase letters, digits, `-` or `_`, starting with a letter',
  })
  name!: string;

  @IsString()
  @MaxLength(100)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SLASH_COMMAND_OPTIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => SlashCommandOptionDto)
  options?: SlashCommandOptionDto[];
}
