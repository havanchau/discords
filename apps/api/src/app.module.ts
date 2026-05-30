import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ServersModule } from './modules/servers/servers.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: ['../../.env', '.env'], isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    RealtimeModule
  ]
})
export class AppModule {}
