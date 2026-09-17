import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  DISCOVERY_DESCRIPTION_MAX_LENGTH,
  DISCOVERY_MAX_TAGS,
  DISCOVERY_TAG_MAX_LENGTH,
} from '@discord-clone/shared';

/** Shapes only; tag characters and the member floor are checked by `ServerDiscoveryService`. */
export class UpdateDiscoveryDto {
  @IsOptional()
  @IsBoolean()
  listed?: boolean;

  /** The server's existing description; an empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(DISCOVERY_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DISCOVERY_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(DISCOVERY_TAG_MAX_LENGTH, { each: true })
  tags?: string[];
}
