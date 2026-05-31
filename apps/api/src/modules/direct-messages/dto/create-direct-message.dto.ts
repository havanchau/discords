import { IsString, MaxLength } from 'class-validator';

export class CreateDirectMessageDto {
  @IsString()
  @MaxLength(4000)
  content = '';
}
