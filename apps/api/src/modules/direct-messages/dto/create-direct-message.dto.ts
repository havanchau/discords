import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDirectMessageDto {
  @IsString()
  @MaxLength(4000)
  content = '';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToMessageId?: string;
}
