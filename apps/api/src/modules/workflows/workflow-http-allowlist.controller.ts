import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AddWorkflowHttpAllowlistEntryDto } from './dto/add-allowlist-entry.dto';
import { WorkflowHttpAllowlistService } from './workflow-http-allowlist.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/workflow-http-allowlist')
export class WorkflowHttpAllowlistController {
  constructor(private readonly allowlist: WorkflowHttpAllowlistService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.allowlist.list(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'workflow-allowlist-add', limit: 20, windowMs: 60_000 })
  @Post()
  add(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: AddWorkflowHttpAllowlistEntryDto,
  ) {
    return this.allowlist.add(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'workflow-allowlist-remove', limit: 20, windowMs: 60_000 })
  @Delete(':entryId')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.allowlist.remove(user.id, serverId, entryId);
  }
}
