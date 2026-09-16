import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { ServerModerationService } from './server-moderation.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule],
  controllers: [ServersController],
  providers: [ServersService, ServerModerationService],
  exports: [ServersService],
})
export class ServersModule {}
