import { IsIn, IsInt } from 'class-validator';

/** 0 clears the timeout; the others are 60s, 5m, 10m, 1h, 1d, and 1w. */
export const TIMEOUT_DURATION_MINUTES = [0, 1, 5, 10, 60, 1440, 10080] as const;

export class TimeoutMemberDto {
  @IsInt()
  @IsIn(TIMEOUT_DURATION_MINUTES)
  durationMinutes!: number;
}
