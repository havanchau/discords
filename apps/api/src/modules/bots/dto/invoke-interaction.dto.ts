import { IsString, MaxLength } from 'class-validator';

/** `POST /channels/:channelId/interactions` — session auth, the invoker is a human member. */
export class InvokeInteractionDto {
  @IsString()
  @MaxLength(64)
  commandId!: string;

  /** Raw text after the command name; parsed against the command's declared options server-side. */
  @IsString()
  @MaxLength(2000)
  args = '';
}
