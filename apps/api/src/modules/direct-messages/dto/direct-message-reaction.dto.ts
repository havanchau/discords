import { IsString, MaxLength, MinLength } from 'class-validator';

export class DirectMessageReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  emoji!: string;
}
