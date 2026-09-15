import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ServersModule } from '../servers/servers.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [AuthModule, ServersModule, PermissionsModule],
  controllers: [ChannelsController, CategoriesController],
  providers: [ChannelsService, CategoriesService],
  exports: [ChannelsService]
})
export class ChannelsModule {}
