import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * The server recomputes dense positions from array order (docs/features/channel-reorder.md →
 * Position scheme); `position` is accepted for forward-compatibility with a future partial-payload
 * version but is not the write source today.
 */
export class ReorderChannelEntryDto {
  @IsString()
  id!: string;

  /** `null` means uncategorized; omit-as-undefined is not accepted — every entry states its category. */
  @ValidateIf((entry: ReorderChannelEntryDto) => entry.categoryId !== null)
  @IsString()
  categoryId!: string | null;

  @IsInt()
  @Min(0)
  position!: number;
}

export class ReorderChannelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderChannelEntryDto)
  channels!: ReorderChannelEntryDto[];
}
