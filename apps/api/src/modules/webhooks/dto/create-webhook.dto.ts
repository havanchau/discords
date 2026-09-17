import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { WEBHOOK_NAME_MAX_LENGTH } from '@discord-clone/shared';

/** Same allowlist as emoji and avatars: only images already stored by this app's upload flow. */
export const UPLOADED_IMAGE_URL_PATTERN =
  /^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp)$/i;

export class CreateWebhookDto {
  @IsString()
  @MaxLength(WEBHOOK_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(UPLOADED_IMAGE_URL_PATTERN, { message: 'Avatar URL must reference an uploaded image' })
  avatarUrl?: string;
}
