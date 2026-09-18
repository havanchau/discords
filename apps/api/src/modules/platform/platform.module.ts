import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformReportsController } from './platform-reports.controller';
import { PlatformReportsService } from './platform-reports.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PlatformReportsController],
  providers: [PlatformReportsService, PlatformAdminGuard],
})
export class PlatformModule {}
