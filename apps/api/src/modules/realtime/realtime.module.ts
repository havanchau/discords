import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LivekitModule } from '@/modules/livekit/livekit.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { SoundboardModule } from '@/modules/soundboard/soundboard.module';
import { StageModule } from '@/modules/stage/stage.module';
import { CallRegistryModule } from './call-registry.module';
import { DmCallsService } from './dm-calls.service';
import { InteractionTimeoutService } from './interaction-timeout.service';
import { MessagesGateway } from './messages.gateway';
import { PresenceService } from './presence.service';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeHeartbeatService } from './realtime-heartbeat.service';
import { RealtimePublisherModule } from './realtime-publisher.module';
import { RealtimeUnreadModule } from './realtime-unread.module';
import { SocketAuthService } from './socket-auth.service';
import { SocketErrorTranslator } from './socket-error-translator.service';
import { SocketRateLimitService } from './socket-rate-limit.service';
import { VoiceGateway } from './voice.gateway';

@Module({
  imports: [
    CallRegistryModule,
    JwtModule,
    LivekitModule,
    MessagesModule,
    NotificationsModule,
    PermissionsModule,
    RealtimePublisherModule,
    RealtimeUnreadModule,
    SoundboardModule,
    StageModule,
  ],
  providers: [
    RealtimeGateway,
    MessagesGateway,
    VoiceGateway,
    DmCallsService,
    PresenceService,
    RealtimeAccessService,
    RealtimeHeartbeatService,
    InteractionTimeoutService,
    SocketAuthService,
    SocketErrorTranslator,
    SocketRateLimitService,
  ],
})
export class RealtimeModule {}
