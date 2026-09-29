import { Module } from '@nestjs/common';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from './realtime-publisher.module';
import { RealtimeViewEvictionService } from './realtime-view-eviction.service';

/*
 * Its own module, separate from RealtimeModule, mirroring RealtimeUnreadModule: ChannelsModule and
 * RolesModule need this service without importing RealtimeModule's own dependency graph.
 */
@Module({
  imports: [PermissionsModule, RealtimePublisherModule],
  providers: [RealtimeViewEvictionService],
  exports: [RealtimeViewEvictionService],
})
export class RealtimeViewEvictionModule {}
