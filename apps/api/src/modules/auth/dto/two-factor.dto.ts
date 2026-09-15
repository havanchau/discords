import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** A 6-digit authenticator code or an xxxx-xxxx recovery code. */
const CODE_PATTERN = /^(\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4})$/;

export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Matches(CODE_PATTERN, { message: 'Enter an authenticator or recovery code' })
  code!: string;
}

export class VerifyTwoFactorLoginDto {
  @IsString()
  @MinLength(16)
  @MaxLength(2048)
  challengeToken!: string;

  @IsString()
  @Matches(CODE_PATTERN, { message: 'Enter an authenticator or recovery code' })
  code!: string;
}
