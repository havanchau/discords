import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  BASE64_PATTERN,
  DEVICE_ID_PATTERN,
  E2EE_DEVICE_LABEL_MAX_LENGTH,
  E2EE_PUBLIC_KEY_MAX_LENGTH,
} from './encryption-patterns';

export class RegisterDeviceKeyDto {
  @IsString()
  @Matches(DEVICE_ID_PATTERN)
  deviceId!: string;

  /** base64 SPKI of an ECDH P-256 public key; the service parses it before storing. */
  @IsString()
  @MinLength(1)
  @MaxLength(E2EE_PUBLIC_KEY_MAX_LENGTH)
  @Matches(BASE64_PATTERN)
  publicKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(E2EE_DEVICE_LABEL_MAX_LENGTH)
  label?: string;
}
