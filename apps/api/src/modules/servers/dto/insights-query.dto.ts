import { IsIn, IsOptional } from 'class-validator';
import { insightsRanges, type InsightsRange } from '@discord-clone/shared';

export class InsightsQueryDto {
  /** Omitted means `7d`. */
  @IsOptional()
  @IsIn(insightsRanges)
  range?: InsightsRange;
}
