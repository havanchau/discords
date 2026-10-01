import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { DeviceKeysController } from './device-keys.controller';
import { DeviceKeysService } from './device-keys.service';
import { EncryptionKeysController } from './encryption-keys.controller';
import { EncryptionKeysService } from './encryption-keys.service';

@Module({
  imports: [AuthModule, PrismaModule, PermissionsModule, ChannelsModule],
  controllers: [DeviceKeysController, EncryptionKeysController],
  providers: [DeviceKeysService, EncryptionKeysService],
})
export class EncryptionModule {}
