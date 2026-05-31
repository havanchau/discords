import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
