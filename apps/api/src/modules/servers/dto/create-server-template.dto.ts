import { IsString, MaxLength, MinLength } from 'class-validator';
import { SERVER_TEMPLATE_NAME_MAX_LENGTH } from '@discord-clone/shared';

export class CreateServerTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SERVER_TEMPLATE_NAME_MAX_LENGTH)
  name!: string;
}
