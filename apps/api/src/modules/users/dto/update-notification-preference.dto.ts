import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { muteDurations, type MuteDuration } from '@discord-clone/shared';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsString()
  serverId?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;

  /** Only valid together with `muted: true`; omitted there means `forever`. */
  @IsOptional()
  @IsIn(muteDurations)
  muteDuration?: MuteDuration;

  @IsOptional()
  @IsBoolean()
  mentionOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  desktopEnabled?: boolean;
}
