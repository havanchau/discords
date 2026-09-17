import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ONBOARDING_MAX_QUESTIONS,
  ONBOARDING_MAX_ROLES_PER_QUESTION,
  ONBOARDING_PROMPT_MAX_LENGTH,
  ONBOARDING_RULES_MAX_LENGTH,
} from '@discord-clone/shared';

/** Shapes only; role ownership and self-assignability are checked by `ServerOnboardingService`. */
export class SelfAssignQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(ONBOARDING_PROMPT_MAX_LENGTH)
  prompt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ONBOARDING_MAX_ROLES_PER_QUESTION)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  roleIds!: string[];

  @IsBoolean()
  multiSelect!: boolean;
}

export class UpdateOnboardingDto {
  @IsBoolean()
  enabled!: boolean;

  /** Omitted keeps the stored text; required (non-empty) whenever screening ends up enabled. */
  @IsOptional()
  @IsString()
  @MaxLength(ONBOARDING_RULES_MAX_LENGTH)
  rulesText?: string;

  /** Omitted keeps the stored questions; an empty array removes them. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ONBOARDING_MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => SelfAssignQuestionDto)
  selfAssignQuestions?: SelfAssignQuestionDto[];
}
