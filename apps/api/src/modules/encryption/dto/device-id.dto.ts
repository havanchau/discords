import { IsString, Matches } from 'class-validator';
import { DEVICE_ID_PATTERN } from './encryption-patterns';

/** `DELETE /devices/keys/:deviceId`. */
export class DeviceIdParamDto {
  @IsString()
  @Matches(DEVICE_ID_PATTERN)
  deviceId!: string;
}

/** `GET /devices/keys/pending-wraps?deviceId=`. */
export class DevicePendingWrapsQueryDto {
  @IsString()
  @Matches(DEVICE_ID_PATTERN)
  deviceId!: string;
}
