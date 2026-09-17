import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A bot's channel message. Text and an optional reply only: attachments need the upload route, which
 * is not on the bot allowlist in phase 1, so the field is refused like any other unknown one.
 */
export class BotCreateMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToMessageId?: string;
}
