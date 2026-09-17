import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LENGTH,
  POLL_QUESTION_MAX_LENGTH,
} from '@/modules/polls/poll-status';

export class CreatePollDto {
  @IsString()
  @MinLength(1)
  @MaxLength(POLL_QUESTION_MAX_LENGTH)
  question!: string;

  @IsArray()
  @ArrayMinSize(POLL_MIN_OPTIONS)
  @ArrayMaxSize(POLL_MAX_OPTIONS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(POLL_OPTION_MAX_LENGTH, { each: true })
  options!: string[];

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsBoolean()
  showVoters?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}
