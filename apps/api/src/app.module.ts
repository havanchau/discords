import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { I18nModule } from './common/i18n/i18n.module';
import { RateLimitGuard } from './common/rate-limit.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AutoModModule } from './modules/automod/automod.module';
import { BotsModule } from './modules/bots/bots.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { DirectMessagesModule } from './modules/direct-messages/direct-messages.module';
import { EmojisModule } from './modules/emojis/emojis.module';
import { SoundboardModule } from './modules/soundboard/soundboard.module';
import { StickersModule } from './modules/stickers/stickers.module';
import { EventsModule } from './modules/events/events.module';
import { ForumModule } from './modules/forum/forum.module';
import { ForwardingModule } from './modules/forwarding/forwarding.module';
import { FriendsModule } from './modules/friends/friends.module';
import { HealthModule } from './modules/health/health.module';
import { LinkPreviewsModule } from './modules/link-previews/link-previews.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PollsModule } from './modules/polls/polls.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { PushModule } from './modules/push/push.module';
import { RedisModule } from './modules/redis/redis.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SavedMessagesModule } from './modules/saved-messages/saved-messages.module';
import { ScheduledMessagesModule } from './modules/scheduled-messages/scheduled-messages.module';
import { ServersModule } from './modules/servers/servers.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: ['../../.env', '.env'], isGlobal: true }),
    I18nModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    AutoModModule,
    UsersModule,
    FriendsModule,
    DirectMessagesModule,
    ForwardingModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    EmojisModule,
    StickersModule,
    SoundboardModule,
    EventsModule,
    ForumModule,
    LinkPreviewsModule,
    NotificationsModule,
    PermissionsModule,
    PlatformModule,
    PollsModule,
    ReportsModule,
    RolesModule,
    SavedMessagesModule,
    ScheduledMessagesModule,
    UploadsModule,
    WebhooksModule,
    BotsModule,
    PushModule,
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
