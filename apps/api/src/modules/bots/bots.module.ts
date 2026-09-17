import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ServersModule } from '@/modules/servers/servers.module';
import { BotApiController } from './bot-api.controller';
import { BotAuthGuard } from './bot-auth.guard';
import { BotAuthorizationService } from './bot-authorization.service';
import { BotMessagesService } from './bot-messages.service';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';

@Module({
  imports: [AuthModule, MessagesModule, PermissionsModule, RealtimePublisherModule, ServersModule],
  controllers: [BotsController, BotApiController],
  // RealtimeUnreadService is stateless (Prisma + permissions), as in ForwardingModule.
  providers: [
    BotsService,
    BotAuthorizationService,
    BotMessagesService,
    BotAuthGuard,
    RealtimeUnreadService,
  ],
})
export class BotsModule {}
