import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { platformAuditActions, type PlatformAuditAction } from '@discord-clone/shared';

/** `<createdAt-epoch-ms>_<id>` of the last row on the previous page, same shape as reports' own. */
export const PLATFORM_AUDIT_LOGS_CURSOR_PATTERN = /^(\d{1,13})_([A-Za-z0-9_-]{1,64})$/;

export class ListPlatformAuditLogsQueryDto {
  @IsOptional()
  @IsIn(platformAuditActions)
  action?: PlatformAuditAction;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @IsOptional()
  @IsString()
  @Matches(PLATFORM_AUDIT_LOGS_CURSOR_PATTERN)
  cursor?: string;
}
