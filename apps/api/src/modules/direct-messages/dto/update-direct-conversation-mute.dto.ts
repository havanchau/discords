import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { muteDurations, type MuteDuration } from '@discord-clone/shared';

export class UpdateDirectConversationMuteDto {
  @IsBoolean()
  muted!: boolean;

  /** Only valid together with `muted: true`; omitted there means `forever`. */
  @IsOptional()
  @IsIn(muteDurations)
  muteDuration?: MuteDuration;
}
