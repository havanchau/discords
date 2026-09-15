import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module';
import { DirectMessageActionsController } from './direct-message-actions.controller';
import { DirectMessageActionsService } from './direct-message-actions.service';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesService } from './direct-messages.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule, RealtimePublisherModule],
  controllers: [DirectMessagesController, DirectMessageActionsController],
  providers: [DirectMessagesService, DirectMessageActionsService, DirectConversationsService],
})
export class DirectMessagesModule {}
