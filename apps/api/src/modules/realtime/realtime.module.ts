import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { DmCallsService } from './dm-calls.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherModule } from './realtime-publisher.module';

@Module({
  imports: [
    JwtModule,
    MessagesModule,
    NotificationsModule,
    PermissionsModule,
    RealtimePublisherModule,
  ],
  providers: [RealtimeGateway, DmCallsService],
})
export class RealtimeModule {}
