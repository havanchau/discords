import { Module } from '@nestjs/common';
import { RealtimePublisher } from './realtime-publisher.service';

@Module({
  providers: [RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimePublisherModule {}
