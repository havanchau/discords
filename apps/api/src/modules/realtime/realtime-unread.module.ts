import { Module } from '@nestjs/common';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from './realtime-publisher.module';
import { RealtimeUnreadService } from './realtime-unread.service';

/*
 * Its own module, separate from RealtimeModule: RealtimeModule imports MessagesModule, and the REST
 * send path in MessagesController now needs RealtimeUnreadService too
 * (docs/features/qa-follow-ups-2026-09-18.md, "REST send") — importing RealtimeModule from
 * MessagesModule would be circular.
 */
@Module({
  imports: [PermissionsModule, RealtimePublisherModule],
  providers: [RealtimeUnreadService],
  exports: [RealtimeUnreadService],
})
export class RealtimeUnreadModule {}
