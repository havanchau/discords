import { IsOptional, IsString, MaxLength } from 'class-validator';

export const RESOLUTION_NOTE_MAX_LENGTH = 500;

export class ResolvePlatformReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(RESOLUTION_NOTE_MAX_LENGTH)
  note?: string;
}
