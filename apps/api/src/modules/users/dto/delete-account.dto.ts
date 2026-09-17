import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** A 6-digit authenticator code or an xxxx-xxxx recovery code, as for disabling 2FA. */
const CODE_PATTERN = /^(\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4})$/;

export class DeleteAccountDto {
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

/** Sent without a session: every session was revoked when the deletion was requested. */
export class CancelAccountDeletionDto extends DeleteAccountDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
