import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';

@Module({
  imports: [AuthModule, ChannelsModule, MessagesModule, PermissionsModule, RealtimePublisherModule],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}
