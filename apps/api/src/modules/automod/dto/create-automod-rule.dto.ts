import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AUTOMOD_MAX_ALLOWED_DOMAINS,
  AUTOMOD_MAX_MENTION_LIMIT,
  AUTOMOD_MAX_PATTERN_LENGTH,
  AUTOMOD_MAX_TERM_LENGTH,
  AUTOMOD_MAX_TERMS,
  autoModActions,
  autoModTimeoutMinutes,
  autoModTriggerTypes,
  type AutoModAction,
  type AutoModTriggerType,
} from '@discord-clone/shared';

/** Shapes only; which fields a trigger or action needs is checked by `AutoModService`. */
export class CreateAutoModRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(autoModTriggerTypes)
  triggerType!: AutoModTriggerType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AUTOMOD_MAX_TERMS)
  @IsString({ each: true })
  @MaxLength(AUTOMOD_MAX_TERM_LENGTH, { each: true })
  terms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(AUTOMOD_MAX_PATTERN_LENGTH)
  pattern?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AUTOMOD_MAX_MENTION_LIMIT)
  mentionLimit?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AUTOMOD_MAX_ALLOWED_DOMAINS)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedDomains?: string[];

  @IsIn(autoModActions)
  action!: AutoModAction;

  @IsOptional()
  @IsBoolean()
  alsoAllowMessage?: boolean;

  @IsOptional()
  @IsInt()
  @IsIn(autoModTimeoutMinutes)
  timeoutMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  alertChannelId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  exemptRoleIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  exemptChannelIds?: string[];
}
