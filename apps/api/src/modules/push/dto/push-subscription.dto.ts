import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

class BrowserPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class SavePushSubscriptionDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BrowserPushSubscriptionDto)
  subscription!: BrowserPushSubscriptionDto;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class DeletePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}
