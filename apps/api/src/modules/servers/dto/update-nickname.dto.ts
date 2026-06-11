import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNicknameDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;
}
