import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowsService } from './workflows.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get('servers/:serverId/workflows')
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.workflows.list(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'workflow-create', limit: 20, windowMs: 60_000 })
  @Post('servers/:serverId/workflows')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflows.create(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'workflow-update', limit: 20, windowMs: 60_000 })
  @Patch('workflows/:workflowId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflows.update(user.id, workflowId, dto);
  }

  @RateLimit({ keyPrefix: 'workflow-regenerate-token', limit: 10, windowMs: 60_000 })
  @Post('workflows/:workflowId/regenerate-token')
  regenerateToken(@CurrentUser() user: RequestUser, @Param('workflowId') workflowId: string) {
    return this.workflows.regenerateToken(user.id, workflowId);
  }

  @RateLimit({ keyPrefix: 'workflow-delete', limit: 20, windowMs: 60_000 })
  @Delete('workflows/:workflowId')
  remove(@CurrentUser() user: RequestUser, @Param('workflowId') workflowId: string) {
    return this.workflows.remove(user.id, workflowId);
  }

  @Get('workflows/:workflowId/runs')
  listRuns(@CurrentUser() user: RequestUser, @Param('workflowId') workflowId: string) {
    return this.workflows.listRuns(user.id, workflowId);
  }
}
