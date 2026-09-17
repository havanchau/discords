import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { DirectMessagesModule } from '@/modules/direct-messages/direct-messages.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ScheduledMessageSweepService } from './scheduled-message-sweep.service';
import { ScheduledMessagesController } from './scheduled-messages.controller';
import { ScheduledMessagesService } from './scheduled-messages.service';

@Module({
  imports: [
    AuthModule,
    ChannelsModule,
    DirectMessagesModule,
    MessagesModule,
    NotificationsModule,
    PermissionsModule,
    RealtimePublisherModule,
  ],
  controllers: [ScheduledMessagesController],
  // RealtimeUnreadService is stateless (Prisma + permissions); same arrangement as ForwardingModule.
  providers: [ScheduledMessagesService, ScheduledMessageSweepService, RealtimeUnreadService],
})
export class ScheduledMessagesModule {}
