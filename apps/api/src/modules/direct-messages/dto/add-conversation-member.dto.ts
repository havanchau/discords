import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddConversationMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;
}
