import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}
