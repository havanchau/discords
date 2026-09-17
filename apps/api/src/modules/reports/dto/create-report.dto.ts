import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  messageReportReasons,
  type MessageReportReason,
  type MessageReportTargetType,
} from '@discord-clone/shared';

export const MAX_REPORT_DETAILS_LENGTH = 500;

export class CreateReportDto {
  @IsIn(['MESSAGE', 'USER'])
  targetType!: MessageReportTargetType;

  // Required for a MESSAGE report; a USER report may carry one as context.
  @ValidateIf((dto: CreateReportDto) => dto.targetType === 'MESSAGE' || dto.messageId !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  messageId?: string;

  @ValidateIf((dto: CreateReportDto) => dto.targetType === 'USER')
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetUserId?: string;

  @IsIn(messageReportReasons)
  reason!: MessageReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REPORT_DETAILS_LENGTH)
  details?: string;
}
