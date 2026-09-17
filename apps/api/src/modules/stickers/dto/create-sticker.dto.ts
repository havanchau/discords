import { IsString, Matches } from 'class-validator';
import { SERVER_ASSET_NAME_PATTERN } from '@discord-clone/shared';

/** Multipart text fields; the image itself arrives as the `file` part. */
export class CreateStickerDto {
  @IsString()
  @Matches(new RegExp(SERVER_ASSET_NAME_PATTERN), {
    message: 'Sticker name must be 2-32 letters, numbers, or underscores',
  })
  name!: string;
}
