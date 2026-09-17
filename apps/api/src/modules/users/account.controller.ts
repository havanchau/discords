import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { rejectWhenLimited } from './reject-when-limited';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ExportAccountDto } from './dto/export-account.dto';

/** Account deletion and data export for the signed-in account. */
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class AccountController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly exports: AccountExportService,
  ) {}

  @RateLimit({ keyPrefix: 'account-delete', limit: 5, windowMs: 15 * 60_000 })
  @HttpCode(200)
  @Post('delete')
  async requestDeletion(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    rejectWhenLimited(response, await this.deletion.hitRequestLimit(user.id));
    return this.deletion.requestDeletion(user.id, dto);
  }

  @RateLimit({ keyPrefix: 'account-export', limit: 10, windowMs: 60 * 60_000 })
  @HttpCode(202)
  @Post('export')
  async requestExport(
    @CurrentUser() user: RequestUser,
    @Body() dto: ExportAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.exports.assertCanStartExport(user.id, dto.password);
    rejectWhenLimited(response, await this.exports.hitRequestLimit(user.id));
    return this.exports.runExport(user.id);
  }

  @Get('export')
  latestExport(@CurrentUser() user: RequestUser) {
    return this.exports.latestJob(user.id);
  }

  @Get('export/:jobId')
  getExport(@CurrentUser() user: RequestUser, @Param('jobId') jobId: string) {
    return this.exports.getJob(user.id, jobId);
  }

  @Header('Cache-Control', 'no-store')
  @Get('export/:jobId/download')
  async downloadExport(@CurrentUser() user: RequestUser, @Param('jobId') jobId: string) {
    const archive = await this.exports.readArchive(user.id, jobId);
    return new StreamableFile(archive.content, {
      type: 'application/json',
      disposition: `attachment; filename="${archive.fileName}"`,
    });
  }
}
