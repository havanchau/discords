import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { LivekitModule } from '@/modules/livekit/livekit.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { CallRegistryModule } from '@/modules/realtime/call-registry.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeViewEvictionModule } from '@/modules/realtime/realtime-view-eviction.module';
import { ServersModule } from '@/modules/servers/servers.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [
    AuthModule,
    ServersModule,
    PermissionsModule,
    RealtimePublisherModule,
    RealtimeViewEvictionModule,
    CallRegistryModule,
    LivekitModule,
    UploadsModule,
  ],
  controllers: [ChannelsController, CategoriesController],
  providers: [ChannelsService, CategoriesService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
