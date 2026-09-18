import { Module } from '@nestjs/common';
import { CallRegistryService } from './call-registry.service';
import { RealtimePublisherModule } from './realtime-publisher.module';

/** Standalone so kick and ban (`ServersModule`) can end a removed member's calls without a cycle. */
@Module({
  imports: [RealtimePublisherModule],
  providers: [CallRegistryService],
  exports: [CallRegistryService],
})
export class CallRegistryModule {}
