import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListForumPostsQueryDto {
  /** The last thread id of the previous page. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tagId?: string;
}
