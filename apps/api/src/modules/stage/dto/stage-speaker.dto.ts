import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddStageSpeakerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;
}
