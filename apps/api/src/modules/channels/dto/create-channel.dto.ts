import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FORUM_POST_GUIDELINES_MAX_LENGTH } from '@discord-clone/shared';

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(['TEXT', 'VOICE', 'FORUM', 'STAGE', 'ANNOUNCEMENT', 'DECISION'])
  type?: 'TEXT' | 'VOICE' | 'FORUM' | 'STAGE' | 'ANNOUNCEMENT' | 'DECISION';

  @IsOptional()
  @IsString()
  @MaxLength(250)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isAgeRestricted?: boolean;

  /** Opt-in end-to-end encryption; `ManageChannels` only, like every other channel setting. */
  @IsOptional()
  @IsBoolean()
  isEncrypted?: boolean;

  /** Kept only when `type` is FORUM. */
  @IsOptional()
  @IsString()
  @MaxLength(FORUM_POST_GUIDELINES_MAX_LENGTH)
  postGuidelines?: string;
}
