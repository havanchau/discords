import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ServersModule } from '@/modules/servers/servers.module';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';
import { DecisionSweepService } from './decision-sweep.service';
import { ServerDecisionsController } from './server-decisions.controller';

@Module({
  imports: [
    AuthModule,
    ChannelsModule,
    MessagesModule,
    PermissionsModule,
    RealtimePublisherModule,
    ServersModule,
  ],
  controllers: [DecisionsController, ServerDecisionsController],
  // RealtimeUnreadService is stateless (Prisma + permissions), as in ForumModule/PollsModule.
  providers: [DecisionsService, DecisionSweepService, RealtimeUnreadService],
})
export class DecisionsModule {}
