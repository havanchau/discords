import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { SlashCommandOptionType } from '@discord-clone/shared';

const OPTION_TYPES: SlashCommandOptionType[] = ['STRING', 'INTEGER', 'BOOLEAN', 'USER', 'CHANNEL'];

/** One declared option of a slash command — small and typed, not a full option tree (see Scope). */
export class SlashCommandOptionDto {
  @IsString()
  @MaxLength(32)
  name!: string;

  @IsString()
  @MaxLength(100)
  description!: string;

  @IsIn(OPTION_TYPES)
  type!: SlashCommandOptionType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
