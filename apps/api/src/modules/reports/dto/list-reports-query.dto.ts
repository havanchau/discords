import { IsIn, IsOptional } from 'class-validator';
import { messageReportStatuses, type MessageReportStatus } from '@discord-clone/shared';

export class ListReportsQueryDto {
  @IsOptional()
  @IsIn(messageReportStatuses)
  status?: MessageReportStatus;
}
