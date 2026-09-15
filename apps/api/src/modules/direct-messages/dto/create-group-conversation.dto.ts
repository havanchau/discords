import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const MAX_GROUP_MEMBERS = 10;

export class CreateGroupConversationDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_GROUP_MEMBERS - 1)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  userIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
