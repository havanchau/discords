import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { E2EE_MAX_WRAPS_PER_UPLOAD } from '@discord-clone/shared';
import { BASE64_PATTERN, E2EE_WRAPPED_KEY_MAX_LENGTH, KEY_ID_PATTERN } from './encryption-patterns';

/** `version` is an ordering hint, so it only needs to be a sane counter. */
const MAX_KEY_VERSION = 1_000_000;

export class WrappedKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  deviceKeyId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(E2EE_WRAPPED_KEY_MAX_LENGTH)
  @Matches(BASE64_PATTERN)
  wrappedKey!: string;
}

export class UploadWrappedKeysDto {
  @IsString()
  @Matches(KEY_ID_PATTERN)
  keyId!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_KEY_VERSION)
  version!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(E2EE_MAX_WRAPS_PER_UPLOAD)
  @ValidateNested({ each: true })
  @Type(() => WrappedKeyDto)
  wraps!: WrappedKeyDto[];
}
