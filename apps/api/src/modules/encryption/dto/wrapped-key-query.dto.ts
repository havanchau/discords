import { IsOptional, IsString, Matches } from 'class-validator';
import { DEVICE_ID_PATTERN, KEY_ID_PATTERN } from './encryption-patterns';

/** `GET /channels/:channelId/encryption/keys?keyId=` and the conversation equivalent. */
export class WrappedKeyQueryDto {
  @IsString()
  @Matches(KEY_ID_PATTERN)
  keyId!: string;

  /**
   * A wrap is addressed to one device, so a user with several devices must say which one is asking.
   * The spec'd request carries only `keyId`; without this a multi-device caller could be handed the
   * wrap of a sibling device, which it cannot unwrap.
   */
  @IsOptional()
  @IsString()
  @Matches(DEVICE_ID_PATTERN)
  deviceId?: string;
}
