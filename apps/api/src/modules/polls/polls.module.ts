import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { DirectMessagesModule } from '@/modules/direct-messages/direct-messages.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';

@Module({
  imports: [
    AuthModule,
    ChannelsModule,
    DirectMessagesModule,
    MessagesModule,
    PermissionsModule,
    RealtimePublisherModule,
  ],
  controllers: [PollsController],
  // RealtimeUnreadService is stateless (Prisma + permissions), as in ForwardingModule.
  providers: [PollsService, RealtimeUnreadService],
})
export class PollsModule {}
