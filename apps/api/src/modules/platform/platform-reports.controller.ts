import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ListPlatformReportsQueryDto } from './dto/list-platform-reports-query.dto';
import { ResolvePlatformReportDto } from './dto/resolve-platform-report.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformReportsService } from './platform-reports.service';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/reports')
export class PlatformReportsController {
  constructor(private readonly reports: PlatformReportsService) {}

  @Get()
  list(@Query() query: ListPlatformReportsQueryDto) {
    return this.reports.list(query);
  }

  @Get(':reportId')
  detail(@Param('reportId') reportId: string) {
    return this.reports.detail(reportId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':reportId/dismiss')
  dismiss(
    @CurrentUser() admin: RequestUser,
    @Param('reportId') reportId: string,
    @Body() dto: ResolvePlatformReportDto,
  ) {
    return this.reports.resolve(admin.id, reportId, 'DISMISSED', dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':reportId/delist')
  delist(
    @CurrentUser() admin: RequestUser,
    @Param('reportId') reportId: string,
    @Body() dto: ResolvePlatformReportDto,
  ) {
    return this.reports.resolve(admin.id, reportId, 'SERVER_DELISTED', dto);
  }
}
