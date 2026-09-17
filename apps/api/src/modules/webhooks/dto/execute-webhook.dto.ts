import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { WEBHOOK_CONTENT_MAX_LENGTH, WEBHOOK_NAME_MAX_LENGTH } from '@discord-clone/shared';
import { UPLOADED_IMAGE_URL_PATTERN } from './create-webhook.dto';

/** Body of the public posting endpoint; unknown fields (attachments, embeds) are rejected. */
export class ExecuteWebhookDto {
  @IsString()
  @MaxLength(WEBHOOK_CONTENT_MAX_LENGTH)
  content!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(WEBHOOK_NAME_MAX_LENGTH)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(UPLOADED_IMAGE_URL_PATTERN, { message: 'Avatar URL must reference an uploaded image' })
  avatarUrl?: string;
}
