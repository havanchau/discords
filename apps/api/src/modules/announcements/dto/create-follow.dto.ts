import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFollowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetChannelId!: string;
}
