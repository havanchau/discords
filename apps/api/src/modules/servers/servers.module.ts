import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { LivekitModule } from '@/modules/livekit/livekit.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { CallRegistryModule } from '@/modules/realtime/call-registry.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { StageModule } from '@/modules/stage/stage.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { ServerDiscoveryController } from './server-discovery.controller';
import { ServerDiscoveryService } from './server-discovery.service';
import { ServerInsightsService } from './server-insights.service';
import { ServerModerationService } from './server-moderation.service';
import { ServerOnboardingService } from './server-onboarding.service';
import { ServerOwnershipService } from './server-ownership.service';
import { ServerTemplatesController } from './server-templates.controller';
import { ServerTemplatesService } from './server-templates.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [
    AuthModule,
    CallRegistryModule,
    LivekitModule,
    PermissionsModule,
    RealtimePublisherModule,
    StageModule,
    UploadsModule,
  ],
  controllers: [ServersController, ServerTemplatesController, ServerDiscoveryController],
  providers: [
    ServersService,
    ServerModerationService,
    ServerInsightsService,
    ServerOnboardingService,
    ServerOwnershipService,
    ServerTemplatesService,
    ServerDiscoveryService,
  ],
  exports: [ServersService],
})
export class ServersModule {}
