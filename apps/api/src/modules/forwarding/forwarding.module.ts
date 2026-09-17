import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { DirectMessagesModule } from '@/modules/direct-messages/direct-messages.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ForwardingController } from './forwarding.controller';
import { ForwardingService } from './forwarding.service';

@Module({
  imports: [
    AuthModule,
    ChannelsModule,
    DirectMessagesModule,
    MessagesModule,
    PermissionsModule,
    RealtimePublisherModule,
  ],
  controllers: [ForwardingController],
  // RealtimeUnreadService is stateless (Prisma + permissions), so this module holds its own instance
  // instead of importing the gateway module.
  providers: [ForwardingService, RealtimeUnreadService],
})
export class ForwardingModule {}
