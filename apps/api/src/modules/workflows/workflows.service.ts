import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelWorkflow, Prisma, WorkflowStep } from '@prisma/client';
import {
  WORKFLOW_MAX_PER_SERVER,
  WORKFLOW_RUN_HISTORY_MAX,
  type WorkflowActionType,
  type WorkflowTriggerType,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowStepDto } from './dto/workflow-step.dto';
import { sealSecretHeader } from './workflow-secrets';
import { WorkflowHttpAllowlistService } from './workflow-http-allowlist.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import {
  generateWorkflowToken,
  hashWorkflowToken,
  workflowExecutorIdentity,
  workflowTriggerPath,
} from './workflow-token';
import {
  StoredHttpCallStepConfig,
  StoredStepConfig,
  toWorkflowRunView,
  toWorkflowView,
} from './workflow-view';

type WorkflowWithSteps = ChannelWorkflow & { steps: WorkflowStep[] };

/**
 * CRUD for a server's workflows. Every write invalidates `WorkflowTriggerService`'s per-server
 * cache of enabled triggers, the same shape `AutoModScreeningService.invalidate` uses.
 */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly allowlist: WorkflowHttpAllowlistService,
    private readonly trigger: WorkflowTriggerService,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string, serverId: string) {
    await this.requireManage(userId, serverId);
    const workflows = await this.prisma.channelWorkflow.findMany({
      where: { serverId },
      include: { steps: true },
      orderBy: { createdAt: 'asc' },
    });
    const existingChannelIds = await this.existingChannelIds(workflows);
    return {
      workflows: workflows.map((wf) =>
        toWorkflowView(wf, existingChannelIds.has(channelIdOf(wf) ?? '')),
      ),
    };
  }

  async create(userId: string, serverId: string, dto: CreateWorkflowDto) {
    await this.requireManage(userId, serverId);
    const total = await this.prisma.channelWorkflow.count({ where: { serverId } });
    if (total >= WORKFLOW_MAX_PER_SERVER) {
      throw new BadRequestException('Workflow limit reached');
    }

    const triggerConfig = await this.buildTriggerConfig(serverId, dto.triggerType, dto);
    const steps = await this.buildSteps(serverId, dto.steps, []);

    let webhookToken: string | null = null;
    let webhookTokenHash: string | null = null;
    if (dto.triggerType === 'WEBHOOK_RECEIVED') {
      webhookToken = generateWorkflowToken();
      webhookTokenHash = hashWorkflowToken(webhookToken);
    }

    const identity = await workflowExecutorIdentity();
    const workflow = await this.prisma.$transaction(async (tx) => {
      const executor = await tx.user.create({
        data: { ...identity, displayName: dto.name, kind: 'WORKFLOW' },
      });
      return tx.channelWorkflow.create({
        data: {
          serverId,
          name: dto.name,
          triggerType: dto.triggerType,
          triggerConfig,
          webhookTokenHash,
          executorUserId: executor.id,
          createdById: userId,
          steps: {
            create: steps.map((step, position) => ({
              position,
              actionType: step.actionType,
              config: step.config as unknown as Prisma.InputJsonValue,
            })),
          },
        },
        include: { steps: true },
      });
    });

    await this.writeAuditLog(serverId, userId, 'WORKFLOW_CREATE', workflow.id, {
      name: workflow.name,
      triggerType: workflow.triggerType,
      stepCount: workflow.steps.length,
    });
    this.trigger.invalidate(serverId);

    const view = toWorkflowView(workflow, await this.channelStillExists(workflow));
    return {
      workflow: view,
      ...(webhookToken ? { triggerUrl: workflowTriggerPath(workflow.id, webhookToken) } : {}),
    };
  }

  async update(userId: string, workflowId: string, dto: UpdateWorkflowDto) {
    const existing = await this.requireWorkflow(workflowId);
    await this.requireManage(userId, existing.serverId);

    const triggerType = dto.triggerType ?? existing.triggerType;
    const triggerConfig =
      dto.triggerType ||
      dto.channelId !== undefined ||
      dto.terms !== undefined ||
      dto.intervalMinutes !== undefined
        ? await this.buildTriggerConfig(existing.serverId, triggerType, dto, existing)
        : existing.triggerConfig;

    const steps = dto.steps
      ? await this.buildSteps(existing.serverId, dto.steps, existing.steps)
      : null;

    // Regenerating the trigger type to WEBHOOK_RECEIVED when it was not one issues a fresh token;
    // an existing WEBHOOK_RECEIVED workflow keeps its token unless `regenerateToken` is called.
    let webhookToken: string | null = null;
    let webhookTokenHash = existing.webhookTokenHash;
    if (triggerType === 'WEBHOOK_RECEIVED' && existing.triggerType !== 'WEBHOOK_RECEIVED') {
      webhookToken = generateWorkflowToken();
      webhookTokenHash = hashWorkflowToken(webhookToken);
    } else if (triggerType !== 'WEBHOOK_RECEIVED') {
      webhookTokenHash = null;
    }

    const workflow = await this.prisma.$transaction(async (tx) => {
      if (dto.name) {
        await tx.user.update({
          where: { id: existing.executorUserId },
          data: { displayName: dto.name },
        });
      }
      if (steps) {
        await tx.workflowStep.deleteMany({ where: { workflowId: existing.id } });
      }
      return tx.channelWorkflow.update({
        where: { id: existing.id },
        data: {
          name: dto.name ?? undefined,
          enabled: dto.enabled ?? undefined,
          triggerType,
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
          webhookTokenHash,
          steps: steps
            ? {
                create: steps.map((step, position) => ({
                  position,
                  actionType: step.actionType,
                  config: step.config as unknown as Prisma.InputJsonValue,
                })),
              }
            : undefined,
        },
        include: { steps: true },
      });
    });

    const action =
      dto.enabled === true && !existing.enabled
        ? 'WORKFLOW_ENABLE'
        : dto.enabled === false && existing.enabled
          ? 'WORKFLOW_DISABLE'
          : 'WORKFLOW_UPDATE';
    await this.writeAuditLog(existing.serverId, userId, action, workflow.id, {
      name: workflow.name,
      triggerType: workflow.triggerType,
      stepCount: workflow.steps.length,
    });
    this.trigger.invalidate(existing.serverId);

    const view = toWorkflowView(workflow, await this.channelStillExists(workflow));
    return {
      workflow: view,
      ...(webhookToken ? { triggerUrl: workflowTriggerPath(workflow.id, webhookToken) } : {}),
    };
  }

  async regenerateToken(userId: string, workflowId: string) {
    const existing = await this.requireWorkflow(workflowId);
    await this.requireManage(userId, existing.serverId);
    if (existing.triggerType !== 'WEBHOOK_RECEIVED') {
      throw new BadRequestException('Only a WEBHOOK_RECEIVED workflow has a token to regenerate');
    }
    const token = generateWorkflowToken();
    await this.prisma.channelWorkflow.update({
      where: { id: existing.id },
      data: { webhookTokenHash: hashWorkflowToken(token) },
    });
    await this.writeAuditLog(existing.serverId, userId, 'WORKFLOW_UPDATE', existing.id, {
      name: existing.name,
      triggerType: existing.triggerType,
      stepCount: existing.steps.length,
      tokenRegenerated: true,
    });
    return { triggerUrl: workflowTriggerPath(existing.id, token) };
  }

  async remove(userId: string, workflowId: string) {
    const existing = await this.requireWorkflow(workflowId);
    await this.requireManage(userId, existing.serverId);
    await this.prisma.channelWorkflow.delete({ where: { id: existing.id } });
    await this.writeAuditLog(existing.serverId, userId, 'WORKFLOW_DELETE', existing.id, {
      name: existing.name,
      triggerType: existing.triggerType,
      stepCount: existing.steps.length,
    });
    this.trigger.invalidate(existing.serverId);
    return { ok: true };
  }

  async listRuns(userId: string, workflowId: string) {
    const existing = await this.requireWorkflow(workflowId);
    await this.requireManage(userId, existing.serverId);
    const runs = await this.prisma.workflowRun.findMany({
      where: { workflowId: existing.id },
      orderBy: { createdAt: 'desc' },
      take: WORKFLOW_RUN_HISTORY_MAX,
    });
    return { runs: runs.map(toWorkflowRunView) };
  }

  private async requireManage(userId: string, serverId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
  }

  private async requireWorkflow(workflowId: string): Promise<WorkflowWithSteps> {
    const workflow = await this.prisma.channelWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  private async requireChannelOfServer(serverId: string, channelId: string, requireText: boolean) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, type: true },
    });
    if (!channel || channel.serverId !== serverId) {
      throw new BadRequestException('Channel not found in this server');
    }
    if (requireText && channel.type !== 'TEXT') {
      throw new BadRequestException('Channel must be a text channel');
    }
    return channel;
  }

  private async buildTriggerConfig(
    serverId: string,
    triggerType: WorkflowTriggerType,
    dto: { channelId?: string; terms?: string[]; intervalMinutes?: number },
    existing?: WorkflowWithSteps,
  ) {
    if (triggerType === 'MESSAGE_MATCHES') {
      const channelId =
        dto.channelId ?? (existing?.triggerConfig as { channelId?: string } | undefined)?.channelId;
      const terms =
        dto.terms ?? (existing?.triggerConfig as { terms?: string[] } | undefined)?.terms;
      if (!channelId) throw new BadRequestException('channelId is required for MESSAGE_MATCHES');
      if (!terms?.length) throw new BadRequestException('terms is required for MESSAGE_MATCHES');
      await this.requireChannelOfServer(serverId, channelId, false);
      return { channelId, terms };
    }
    if (triggerType === 'SCHEDULE') {
      const intervalMinutes =
        dto.intervalMinutes ??
        (existing?.triggerConfig as { intervalMinutes?: number } | undefined)?.intervalMinutes;
      if (!intervalMinutes)
        throw new BadRequestException('intervalMinutes is required for SCHEDULE');
      return { intervalMinutes };
    }
    return {};
  }

  private async buildSteps(
    serverId: string,
    stepDtos: WorkflowStepDto[],
    existingSteps: WorkflowStep[],
  ): Promise<Array<{ actionType: WorkflowActionType; config: StoredStepConfig }>> {
    if (!stepDtos.length) throw new BadRequestException('Workflow needs at least one step');

    const existingByPosition = new Map(existingSteps.map((step) => [step.position, step]));
    const built: Array<{ actionType: WorkflowActionType; config: StoredStepConfig }> = [];
    for (const [position, step] of stepDtos.entries()) {
      built.push({
        actionType: step.actionType,
        config: await this.buildStepConfig(serverId, step, existingByPosition.get(position)),
      });
    }
    return built;
  }

  private async buildStepConfig(
    serverId: string,
    step: WorkflowStepDto,
    existingStep: WorkflowStep | undefined,
  ): Promise<StoredStepConfig> {
    if (step.actionType === 'POST_MESSAGE') {
      if (!step.channelId) throw new BadRequestException('channelId is required for POST_MESSAGE');
      if (!step.content?.trim())
        throw new BadRequestException('content is required for POST_MESSAGE');
      await this.requireChannelOfServer(serverId, step.channelId, true);
      return { channelId: step.channelId, content: step.content.trim() };
    }

    // HTTP_CALL
    if (!step.url) throw new BadRequestException('url is required for HTTP_CALL');
    if (!step.method) throw new BadRequestException('method is required for HTTP_CALL');
    const hostname = new URL(step.url).hostname;
    await this.allowlist.requireAllowedHost(serverId, hostname);

    const existing = existingStep?.config as StoredHttpCallStepConfig | undefined;
    let secretHeader: StoredHttpCallStepConfig['secretHeader'];
    if (step.keepExistingSecret && existing?.secretHeader) {
      secretHeader = existing.secretHeader;
    } else if (step.secretHeaderName && step.secretHeaderValue) {
      secretHeader = {
        name: step.secretHeaderName,
        sealedValue: sealSecretHeader(step.secretHeaderValue, this.config),
      };
    }

    return {
      url: step.url,
      method: step.method,
      body: step.body,
      ...(secretHeader ? { secretHeader } : {}),
    };
  }

  private async existingChannelIds(workflows: WorkflowWithSteps[]) {
    const channelIds = workflows
      .filter((workflow) => workflow.triggerType === 'MESSAGE_MATCHES')
      .map(channelIdOf)
      .filter((id): id is string => Boolean(id));
    if (!channelIds.length) return new Set<string>();
    const channels = await this.prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true },
    });
    return new Set(channels.map((channel) => channel.id));
  }

  private async channelStillExists(workflow: WorkflowWithSteps) {
    const channelId = channelIdOf(workflow);
    if (!channelId) return true;
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    return channel !== null;
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}

function channelIdOf(workflow: WorkflowWithSteps): string | undefined {
  return workflow.triggerType === 'MESSAGE_MATCHES'
    ? (workflow.triggerConfig as { channelId?: string })?.channelId
    : undefined;
}
