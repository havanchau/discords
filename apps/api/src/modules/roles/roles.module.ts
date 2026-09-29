import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeViewEvictionModule } from '@/modules/realtime/realtime-view-eviction.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [
    AuthModule,
    PermissionsModule,
    RealtimePublisherModule,
    RealtimeViewEvictionModule,
    UploadsModule,
  ],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
