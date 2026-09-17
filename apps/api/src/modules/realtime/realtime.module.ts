import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagesModule } from '@/modules/messages/messages.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { SoundboardModule } from '@/modules/soundboard/soundboard.module';
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
import { SocketErrorTranslator } from './socket-error-translator.service';
import { SocketRateLimitService } from './socket-rate-limit.service';
import { VoiceGateway } from './voice.gateway';

@Module({
  imports: [
    JwtModule,
    MessagesModule,
    NotificationsModule,
    PermissionsModule,
    RealtimePublisherModule,
    SoundboardModule,
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
    SocketErrorTranslator,
    SocketRateLimitService,
  ],
})
export class RealtimeModule {}
