import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

export class ChannelPermissionOverrideDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allow!: string[];

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  deny!: string[];
}

export class UpdateChannelOverridesDto {
  @IsArray()
  overrides!: ChannelPermissionOverrideDto[];
}
