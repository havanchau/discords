import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ListPlatformAuditLogsQueryDto } from './dto/list-platform-audit-logs-query.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAuditLogsService } from './platform-audit-logs.service';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/audit-logs')
export class PlatformAuditLogsController {
  constructor(private readonly auditLogs: PlatformAuditLogsService) {}

  @Get()
  list(@Query() query: ListPlatformAuditLogsQueryDto) {
    return this.auditLogs.list(query);
  }
}
