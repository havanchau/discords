import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
  @IsString()
  @MaxLength(1000)
  @Matches(/^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp)$/i, {
    message: 'Avatar URL must reference an uploaded image'
  })
  avatarUrl?: string;
}
