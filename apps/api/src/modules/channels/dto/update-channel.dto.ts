import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FORUM_POST_GUIDELINES_MAX_LENGTH } from '@discord-clone/shared';
import { SLOWMODE_OPTIONS_SECONDS } from '@/modules/messages/slowmode';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsBoolean()
  isAgeRestricted?: boolean;

  /** Opt-in end-to-end encryption; `ManageChannels` only, like every other channel setting. */
  @IsOptional()
  @IsBoolean()
  isEncrypted?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsInt()
  @IsIn(SLOWMODE_OPTIONS_SECONDS)
  slowmodeSeconds?: number;

  /** A category id of the same server, or null to remove the channel from its category. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string | null;

  /** FORUM channels only; blank text clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(FORUM_POST_GUIDELINES_MAX_LENGTH)
  postGuidelines?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(
    /^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp)$/i,
    {
      message: 'Avatar URL must reference an uploaded image',
    },
  )
  avatarUrl?: string;
}
