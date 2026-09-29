import type { Prisma } from '@prisma/client';
import {
  WORKFLOW_MAX_CHAIN_DEPTH,
  WORKFLOW_MAX_CONCURRENT_RUNS_PER_SERVER,
  WORKFLOW_MAX_CONCURRENT_RUNS_PER_WORKFLOW,
  type WorkflowTriggerType,
} from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';

export interface WorkflowForRunCreation {
  id: string;
  serverId: string;
  steps: Prisma.InputJsonValue;
}

export interface CreateWorkflowRunParams {
  triggerType: WorkflowTriggerType;
  idempotencyKey?: string | null;
  causeRunId?: string | null;
  depth: number;
}

/**
 * The one place every trigger (webhook, message match, schedule) creates a `WorkflowRun`. Enforces
 * the chain-depth cap and the per-workflow/per-server concurrency caps (Changes -> Rules items 7-8)
 * before the row exists, so a run past either cap is created already `FAILED` and executes no steps
 * -- never queued unbounded, never silently dropped.
 */
export async function createWorkflowRun(
  prisma: PrismaService,
  workflow: WorkflowForRunCreation,
  params: CreateWorkflowRunParams,
) {
  if (params.depth > WORKFLOW_MAX_CHAIN_DEPTH) {
    return failedRun(prisma, workflow, params, 'CHAIN_DEPTH_EXCEEDED');
  }

  const [workflowActive, serverActive] = await Promise.all([
    prisma.workflowRun.count({
      where: { workflowId: workflow.id, status: { in: ['PENDING', 'RUNNING'] } },
    }),
    prisma.workflowRun.count({
      where: {
        workflow: { serverId: workflow.serverId },
        status: { in: ['PENDING', 'RUNNING'] },
      },
    }),
  ]);
  if (
    workflowActive >= WORKFLOW_MAX_CONCURRENT_RUNS_PER_WORKFLOW ||
    serverActive >= WORKFLOW_MAX_CONCURRENT_RUNS_PER_SERVER
  ) {
    return failedRun(prisma, workflow, params, 'RATE_LIMITED');
  }

  return prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      status: 'PENDING',
      triggerType: params.triggerType,
      idempotencyKey: params.idempotencyKey ?? null,
      causeRunId: params.causeRunId ?? null,
      depth: params.depth,
      stepSnapshot: workflow.steps,
    },
  });
}

function failedRun(
  prisma: PrismaService,
  workflow: WorkflowForRunCreation,
  params: CreateWorkflowRunParams,
  failureReason: 'CHAIN_DEPTH_EXCEEDED' | 'RATE_LIMITED',
) {
  const now = new Date();
  return prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      status: 'FAILED',
      triggerType: params.triggerType,
      idempotencyKey: params.idempotencyKey ?? null,
      causeRunId: params.causeRunId ?? null,
      depth: params.depth,
      stepSnapshot: workflow.steps,
      failureReason,
      startedAt: now,
      finishedAt: now,
    },
  });
}
