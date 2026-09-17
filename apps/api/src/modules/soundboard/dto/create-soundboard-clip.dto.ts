import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { SERVER_ASSET_NAME_PATTERN, SOUNDBOARD_CLIP_MAX_DURATION_MS } from '@discord-clone/shared';

/** Multipart text fields; the audio itself arrives as the `file` part. */
export class CreateSoundboardClipDto {
  @IsString()
  @Matches(new RegExp(SERVER_ASSET_NAME_PATTERN), {
    message: 'Soundboard clip name must be 2-32 letters, numbers, or underscores',
  })
  name!: string;

  /**
   * Measured by the uploader's browser. The API cannot decode audio, so this is range-checked only;
   * the byte cap on the received file is the enforced backstop.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SOUNDBOARD_CLIP_MAX_DURATION_MS)
  durationMs!: number;
}
