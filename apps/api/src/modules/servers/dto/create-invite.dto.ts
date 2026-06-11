import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
