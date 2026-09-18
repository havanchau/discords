import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { platformReportStatuses, type PlatformReportStatus } from '@discord-clone/shared';

/** `<createdAt-epoch-ms>_<reportId>` of the last row on the previous page. */
export const PLATFORM_REPORTS_CURSOR_PATTERN = /^(\d{1,13})_([A-Za-z0-9_-]{1,64})$/;

export class ListPlatformReportsQueryDto {
  @IsOptional()
  @IsIn(platformReportStatuses)
  status?: PlatformReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serverId?: string;

  @IsOptional()
  @IsString()
  @Matches(PLATFORM_REPORTS_CURSOR_PATTERN)
  cursor?: string;
}
