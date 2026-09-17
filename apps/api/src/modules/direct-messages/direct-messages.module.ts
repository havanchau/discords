import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { DirectMessageActionsController } from './direct-message-actions.controller';
import { DirectMessageActionsService } from './direct-message-actions.service';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesService } from './direct-messages.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule, RealtimePublisherModule],
  controllers: [DirectMessagesController, DirectMessageActionsController],
  providers: [DirectMessagesService, DirectMessageActionsService, DirectConversationsService],
  exports: [DirectMessagesService],
})
export class DirectMessagesModule {}
