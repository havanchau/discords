import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DISCOVERY_QUERY_MAX_LENGTH, DISCOVERY_TAG_MAX_LENGTH } from '@discord-clone/shared';

export const DISCOVERY_CURSOR_PATTERN = /^(\d{1,9})_([A-Za-z0-9_-]{1,64})$/;

export class DiscoveryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(DISCOVERY_QUERY_MAX_LENGTH)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DISCOVERY_TAG_MAX_LENGTH)
  tag?: string;

  /** `<memberCount>_<serverId>` of the last card on the previous page. */
  @IsOptional()
  @IsString()
  @Matches(DISCOVERY_CURSOR_PATTERN)
  cursor?: string;
}
