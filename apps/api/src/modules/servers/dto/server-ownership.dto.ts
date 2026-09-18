import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** A 6-digit authenticator code or an xxxx-xxxx recovery code, as for account deletion. */
const CODE_PATTERN = /^(\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4})$/;

export class DeleteServerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  /** Required when two-factor authentication is enabled; checked by the service. */
  @IsOptional()
  @IsString()
  @Matches(CODE_PATTERN, { message: 'Enter an authenticator or recovery code' })
  code?: string;
}

export class TransferServerDto extends DeleteServerDto {
  /** The user id of the member who becomes the owner. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;
}
