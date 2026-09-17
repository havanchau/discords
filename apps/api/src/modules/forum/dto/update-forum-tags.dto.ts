import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FORUM_MAX_TAGS, FORUM_TAG_NAME_MAX_LENGTH } from '@discord-clone/shared';

export class ForumTagInputDto {
  /** Omitted for a new tag. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(FORUM_TAG_NAME_MAX_LENGTH)
  @Matches(/\S/, { message: 'Forum tag name cannot be blank' })
  name!: string;
}

/** The complete tag set, in display order. */
export class UpdateForumTagsDto {
  @IsArray()
  @ArrayMaxSize(FORUM_MAX_TAGS)
  @ValidateNested({ each: true })
  @Type(() => ForumTagInputDto)
  tags!: ForumTagInputDto[];
}
