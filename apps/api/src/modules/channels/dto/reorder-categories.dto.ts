import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';

/** Order in the array *is* the order — no per-item `position` field, categories have no parent. */
export class ReorderCategoryEntryDto {
  @IsString()
  id!: string;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryEntryDto)
  categories!: ReorderCategoryEntryDto[];
}
