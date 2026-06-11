import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagesModule } from '../messages/messages.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherModule } from './realtime-publisher.module';

@Module({
  imports: [JwtModule, MessagesModule, PermissionsModule, RealtimePublisherModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
