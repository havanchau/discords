import { IsBoolean, IsOptional, IsString } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  mentionOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  desktopEnabled?: boolean;
}
