import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VOICE_ATTACHMENT_KIND,
  VOICE_MESSAGE_MAX_DURATION_MS,
  VOICE_WAVEFORM_MAX_BUCKETS,
  VOICE_WAVEFORM_MAX_PEAK,
  VOICE_WAVEFORM_MIN_BUCKETS,
} from '@discord-clone/shared';

export class MessageAttachmentInputDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  @IsIn([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'video/mp4',
    'video/webm',
    'application/pdf',
    'text/plain',
    'application/zip',
  ])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  byteSize!: number;

  @IsString()
  @MaxLength(1000)
  @Matches(
    /^(?:\/uploads\/[0-9a-f-]{36}|https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/(?:image|video|raw)\/upload\/.+)\.(?:jpg|jpeg|png|gif|webp|mp3|m4a|ogg|wav|mp4|webm|pdf|txt|zip)$/i,
    {
      message: 'Attachment URL must reference an uploaded file',
    },
  )
  url!: string;

  // Voice-message metadata. The services re-check it (`message-attachments.ts`) because the socket
  // send path does not run this DTO through the validation pipe.
  @IsOptional()
  @IsIn([VOICE_ATTACHMENT_KIND])
  kind?: typeof VOICE_ATTACHMENT_KIND | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(VOICE_MESSAGE_MAX_DURATION_MS)
  durationMs?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(VOICE_WAVEFORM_MIN_BUCKETS)
  @ArrayMaxSize(VOICE_WAVEFORM_MAX_BUCKETS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(VOICE_WAVEFORM_MAX_PEAK, { each: true })
  waveform?: number[];
}

export class CreateMessageDto {
  @IsString()
  @MaxLength(4000)
  content = '';

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  /** A sticker of the destination's server, added as a `kind: 'sticker'` attachment by the service. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stickerId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];
}
