import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookExecuteController } from './webhook-execute.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuthModule, MessagesModule, PermissionsModule, RealtimePublisherModule],
  controllers: [WebhooksController, WebhookExecuteController],
  // RealtimeUnreadService is stateless (Prisma + permissions), as in ForwardingModule.
  providers: [WebhooksService, WebhookDeliveryService, RealtimeUnreadService],
})
export class WebhooksModule {}
