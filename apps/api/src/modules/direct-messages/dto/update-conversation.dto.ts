import { IsString, MaxLength } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}
