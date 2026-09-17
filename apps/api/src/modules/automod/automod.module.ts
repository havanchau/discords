import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { AutoModScreeningService } from './automod-screening.service';
import { AutoModController } from './automod.controller';
import { AutoModService } from './automod.service';

/** Rule CRUD, and the screening every channel send path runs through `MessagesService`. */
@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule],
  controllers: [AutoModController],
  providers: [AutoModService, AutoModScreeningService],
  exports: [AutoModScreeningService],
})
export class AutoModModule {}
