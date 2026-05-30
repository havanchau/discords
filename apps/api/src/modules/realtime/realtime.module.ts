import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule, MessagesModule],
  providers: [RealtimeGateway]
})
export class RealtimeModule {}
