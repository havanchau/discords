import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PushModule } from '../push/push.module';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [AuthModule, ChannelsModule, PermissionsModule, PushModule, RealtimePublisherModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
