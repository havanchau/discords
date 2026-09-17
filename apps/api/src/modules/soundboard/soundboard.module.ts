import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { SoundboardPlaybackService } from './soundboard-playback.service';
import { SoundboardController } from './soundboard.controller';
import { SoundboardService } from './soundboard.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule, UploadsModule],
  controllers: [SoundboardController],
  providers: [SoundboardService, SoundboardPlaybackService],
  // The voice gateway authorizes `soundboard:play` through the playback service.
  exports: [SoundboardPlaybackService],
})
export class SoundboardModule {}
