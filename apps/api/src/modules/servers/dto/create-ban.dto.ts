import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
