import { ArrayMaxSize, Equals, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { ONBOARDING_MAX_QUESTIONS, ONBOARDING_MAX_ROLES_PER_QUESTION } from '@discord-clone/shared';

export class AcceptOnboardingDto {
  /** The explicit rules acknowledgment; required even when no questions are configured. */
  @Equals(true)
  rulesAccepted!: true;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ONBOARDING_MAX_QUESTIONS * ONBOARDING_MAX_ROLES_PER_QUESTION)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  roleIds?: string[];
}
