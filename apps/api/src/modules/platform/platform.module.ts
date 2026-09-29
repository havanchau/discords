import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAuditLogsController } from './platform-audit-logs.controller';
import { PlatformAuditLogsService } from './platform-audit-logs.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformReportsController } from './platform-reports.controller';
import { PlatformReportsService } from './platform-reports.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PlatformReportsController, PlatformAuditLogsController],
  providers: [
    PlatformReportsService,
    PlatformAdminGuard,
    PlatformAuditService,
    PlatformAuditLogsService,
  ],
  exports: [PlatformAuditService],
})
export class PlatformModule {}
