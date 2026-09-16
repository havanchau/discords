import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
