import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { AutoModModule } from '@/modules/automod/automod.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { PushModule } from '@/modules/push/push.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadModule } from '@/modules/realtime/realtime-unread.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [
    AuthModule,
    AutoModModule,
    ChannelsModule,
    PermissionsModule,
    PushModule,
    RealtimePublisherModule,
    RealtimeUnreadModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
