import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { BOT_NAME_MAX_LENGTH, BOT_NAME_MIN_LENGTH, BOT_NAME_PATTERN } from '@discord-clone/shared';
import { UPLOADED_IMAGE_URL_PATTERN } from '@/modules/webhooks/dto/create-webhook.dto';

export class CreateBotDto {
  @IsString()
  @MinLength(BOT_NAME_MIN_LENGTH)
  @MaxLength(BOT_NAME_MAX_LENGTH)
  @Matches(BOT_NAME_PATTERN, { message: 'Bot name contains unsupported characters' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(UPLOADED_IMAGE_URL_PATTERN, { message: 'Avatar URL must reference an uploaded image' })
  avatarUrl?: string;
}
