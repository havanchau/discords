import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { AccountDeletionCancelController } from './account-deletion-cancel.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';
import { AccountSweepService } from './account-sweep.service';
import { AccountController } from './account.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule, UploadsModule],
  controllers: [UsersController, AccountController, AccountDeletionCancelController],
  providers: [UsersService, AccountDeletionService, AccountExportService, AccountSweepService],
})
export class UsersModule {}
