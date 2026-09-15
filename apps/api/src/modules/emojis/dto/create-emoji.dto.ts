import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateEmojiDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{2,32}$/, {
    message: 'Emoji name must be 2-32 letters, numbers, or underscores',
  })
  name!: string;

  @IsString()
  @MaxLength(1000)
  @Matches(
    /^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp)$/i,
    { message: 'Emoji URL must reference an uploaded image' },
  )
  url!: string;
}
