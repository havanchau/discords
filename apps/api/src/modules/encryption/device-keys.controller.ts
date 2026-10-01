import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { DeviceKeysService } from './device-keys.service';
import { DeviceIdParamDto, DevicePendingWrapsQueryDto } from './dto/device-id.dto';
import { RegisterDeviceKeyDto } from './dto/register-device-key.dto';

@UseGuards(JwtAuthGuard)
@Controller('devices/keys')
export class DeviceKeysController {
  constructor(private readonly deviceKeys: DeviceKeysService) {}

  @RateLimit({ keyPrefix: 'device-key-register', limit: 10, windowMs: 60_000 })
  @Post()
  register(@CurrentUser() user: RequestUser, @Body() dto: RegisterDeviceKeyDto) {
    return this.deviceKeys.register(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.deviceKeys.list(user.id);
  }

  @Get('pending-wraps')
  pendingWraps(@CurrentUser() user: RequestUser, @Query() query: DevicePendingWrapsQueryDto) {
    return this.deviceKeys.pendingWraps(user.id, query.deviceId);
  }

  @RateLimit({ keyPrefix: 'device-key-revoke', limit: 30, windowMs: 60_000 })
  @Delete(':deviceId')
  revoke(@CurrentUser() user: RequestUser, @Param() params: DeviceIdParamDto) {
    return this.deviceKeys.revoke(user.id, params.deviceId);
  }
}
