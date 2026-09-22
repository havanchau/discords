import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadModule } from '@/modules/realtime/realtime-unread.module';
import { AnnouncementsController } from './announcements.controller';
import { ChannelFollowsService } from './channel-follows.service';
import { PublishService } from './publish.service';

/** Announcement channels: follows (stored as `ServerWebhook` rows) and publishing to them. */
@Module({
  imports: [
    AuthModule,
    MessagesModule,
    PermissionsModule,
    RealtimePublisherModule,
    RealtimeUnreadModule,
  ],
  controllers: [AnnouncementsController],
  providers: [ChannelFollowsService, PublishService],
})
export class AnnouncementsModule {}
