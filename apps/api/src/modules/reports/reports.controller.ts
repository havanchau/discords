import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateReportDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Keyed by reporter rather than IP (the @RateLimit guard's key), so the same shape as the guard's
    // 429 is produced here.
    const limit = await this.reports.hitCreateLimit(user.id, serverId);
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException(
        `Rate limit exceeded. Retry after ${limit.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const result = await this.reports.create(user.id, serverId, dto);
    // 201 for a new report, 200 when the reporter already had this target open.
    response.status(result.created ? 201 : 200);
    return result;
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Query() query: ListReportsQueryDto,
  ) {
    return this.reports.list(user.id, serverId, query.status);
  }

  @RateLimit({ keyPrefix: 'message-report-update', limit: 20, windowMs: 60_000 })
  @Patch(':reportId')
  updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reports.updateStatus(user.id, serverId, reportId, dto);
  }
}
