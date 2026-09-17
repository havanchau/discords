import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  messageReportReasons,
  SERVER_REPORT_DETAILS_MAX_LENGTH,
  type MessageReportReason,
} from '@discord-clone/shared';

export class ReportServerDto {
  @IsIn(messageReportReasons)
  reason!: MessageReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(SERVER_REPORT_DETAILS_MAX_LENGTH)
  details?: string;
}
