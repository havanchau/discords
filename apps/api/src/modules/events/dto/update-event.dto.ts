import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Every field is optional; `null` clears the optional ones. */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endAt?: string | null;
}
