import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ForumController } from './forum.controller';
import { ForumPostsService } from './forum-posts.service';
import { ForumTagsService } from './forum-tags.service';

@Module({
  imports: [AuthModule, ChannelsModule, MessagesModule, PermissionsModule, RealtimePublisherModule],
  controllers: [ForumController],
  // RealtimeUnreadService is stateless (Prisma + permissions), as in ForwardingModule.
  providers: [ForumPostsService, ForumTagsService, RealtimeUnreadService],
})
export class ForumModule {}
