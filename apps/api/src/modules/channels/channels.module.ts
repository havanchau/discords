import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { ServersModule } from '@/modules/servers/servers.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [AuthModule, ServersModule, PermissionsModule, RealtimePublisherModule],
  controllers: [ChannelsController, CategoriesController],
  providers: [ChannelsService, CategoriesService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
