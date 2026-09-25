import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const DECISION_STATUSES = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'] as const;

export class ListDecisionsQueryDto {
  /** The last decision id of the previous page. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @IsIn(DECISION_STATUSES)
  status?: (typeof DECISION_STATUSES)[number];
}

/** The server-wide decision index: the same filters, plus a date range and an optional channel. */
export class ListServerDecisionsQueryDto extends ListDecisionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
