import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { LivekitModule } from '@/modules/livekit/livekit.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { StageController } from './stage.controller';
import { StageService } from './stage.service';

@Module({
  imports: [AuthModule, LivekitModule, PermissionsModule, RealtimePublisherModule],
  controllers: [StageController],
  providers: [StageService],
  // The voice gateway resolves a joiner's stage role; kick and ban clean up a removed member.
  exports: [StageService],
})
export class StageModule {}
