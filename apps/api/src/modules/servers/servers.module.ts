import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module';
import { ServerModerationService } from './server-moderation.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule],
  controllers: [ServersController],
  providers: [ServersService, ServerModerationService],
  exports: [ServersService]
})
export class ServersModule {}
