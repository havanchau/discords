import { UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxDate,
  MaxLength,
} from 'class-validator';
import { locales } from '@/common/i18n/locale';

/** Uploaded-image URLs only: local `/uploads/<uuid>.<ext>` or a Cloudinary image delivery URL. */
const UPLOADED_IMAGE_PATTERN =
  /^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp)$/i;

// A client with a skewed clock must not be able to pin a status far into the future.
const MAX_CUSTOM_STATUS_HOURS = 24;

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  pronouns?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customStatusText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customStatusEmoji?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(Date.now() + MAX_CUSTOM_STATUS_HOURS * 60 * 60 * 1000), {
    message: `Custom status cannot expire more than ${MAX_CUSTOM_STATUS_HOURS} hours from now`,
  })
  customStatusExpiresAt?: Date;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsIn(locales)
  locale?: (typeof locales)[number];

  /** `null` clears the avatar. A non-null value must be an `Upload` the caller owns (checked in the service). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(UPLOADED_IMAGE_PATTERN, {
    message: 'Avatar URL must reference an uploaded image',
  })
  avatarUrl?: string | null;

  /** `null` clears the banner. A non-null value must be an `Upload` the caller owns (checked in the service). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(UPLOADED_IMAGE_PATTERN, {
    message: 'Banner URL must reference an uploaded image',
  })
  bannerUrl?: string | null;
}
