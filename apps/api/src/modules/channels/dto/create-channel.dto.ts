import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FORUM_POST_GUIDELINES_MAX_LENGTH } from '@discord-clone/shared';

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(['TEXT', 'VOICE', 'FORUM', 'STAGE'])
  type?: 'TEXT' | 'VOICE' | 'FORUM' | 'STAGE';

  @IsOptional()
  @IsString()
  @MaxLength(250)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  /** Kept only when `type` is FORUM. */
  @IsOptional()
  @IsString()
  @MaxLength(FORUM_POST_GUIDELINES_MAX_LENGTH)
  postGuidelines?: string;
}
