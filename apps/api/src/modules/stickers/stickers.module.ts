import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule, UploadsModule],
  controllers: [StickersController],
  providers: [StickersService],
})
export class StickersModule {}
