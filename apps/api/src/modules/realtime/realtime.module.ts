import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CallRegistryService } from './call-registry.service';
import { DmCallsService } from './dm-calls.service';
import { MessagesGateway } from './messages.gateway';
import { PresenceService } from './presence.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeHeartbeatService } from './realtime-heartbeat.service';
import { RealtimePublisherModule } from './realtime-publisher.module';
import { RealtimeUnreadService } from './realtime-unread.service';
import { SocketAuthService } from './socket-auth.service';
import { SocketRateLimitService } from './socket-rate-limit.service';
import { VoiceGateway } from './voice.gateway';

@Module({
  imports: [
    JwtModule,
    MessagesModule,
    NotificationsModule,
    PermissionsModule,
    RealtimePublisherModule,
  ],
  providers: [
    RealtimeGateway,
    MessagesGateway,
    VoiceGateway,
    CallRegistryService,
    DmCallsService,
    PresenceService,
    RealtimeAccessService,
    RealtimeHeartbeatService,
    RealtimeUnreadService,
    SocketAuthService,
    SocketRateLimitService,
  ],
})
export class RealtimeModule {}
