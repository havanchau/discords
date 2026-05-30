import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(['TEXT', 'VOICE'])
  type?: 'TEXT' | 'VOICE';

  @IsOptional()
  @IsString()
  @MaxLength(250)
  topic?: string;
}
