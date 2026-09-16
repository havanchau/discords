import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Matches the account avatar rule in `users/dto/update-me.dto.ts`. */
const UPLOADED_IMAGE_PATTERN =
  /^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp)$/i;

/** Carries a member's own per-server identity: nickname and avatar. */
export class UpdateNicknameDto {
  /** `null` or an empty string clears the nickname. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string | null;

  /** `null` clears the per-server avatar so the account avatar is used again. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(UPLOADED_IMAGE_PATTERN, {
    message: 'Avatar URL must reference an uploaded image',
  })
  avatarUrl?: string | null;
}
