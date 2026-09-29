import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  WORKFLOW_STALE_CLAIM_MS,
  WORKFLOW_SWEEP_BATCH,
  WORKFLOW_SWEEP_INTERVAL_MS,
} from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { WorkflowActionsService } from './workflow-actions';
import { createWorkflowRun } from './workflow-run-limits';
import { toStepSnapshot, type WorkflowStepSnapshotEntry } from './workflow-view';

/**
 * Claims and executes due workflow runs, and claims due `SCHEDULE` fires. Every API instance runs
 * this timer; every claim is a conditional `updateMany` (`PENDING` -> `RUNNING`, or a `SCHEDULE`
 * workflow's `nextRunAt` advanced), the same pattern `ScheduledMessageSweepService` and
 * `ReminderSweepService` already use, so a run or a schedule fire is claimed by exactly one instance.
 */
@Injectable()
export class WorkflowRunSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowRunSweepService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: WorkflowActionsService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, WORKFLOW_SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      const now = new Date();
      await this.failStaleClaims(now);
      await this.claimDueSchedules(now);
      await this.claimAndExecutePendingRuns(now);
    } catch (error) {
      this.logger.error('Workflow run sweep failed', errorDetail(error));
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * A row left `RUNNING` belongs to an instance that stopped mid-execution. It is failed, not
   * re-run: an earlier step's side effect (a message already posted, an HTTP call already sent) may
   * already exist and cannot be taken back (Scope, "No automatic retry on failure").
   */
  private async failStaleClaims(now: Date) {
    const cutoff = new Date(now.getTime() - WORKFLOW_STALE_CLAIM_MS);
    const stale = await this.prisma.workflowRun.findMany({
      where: { status: 'RUNNING', claimedAt: { lt: cutoff } },
      take: WORKFLOW_SWEEP_BATCH,
      select: { id: true },
    });
    for (const { id } of stale) {
      const { count } = await this.prisma.workflowRun.updateMany({
        where: { id, status: 'RUNNING', claimedAt: { lt: cutoff } },
        data: { status: 'FAILED', failureReason: 'UNKNOWN', finishedAt: now },
      });
      if (count > 0)
        this.logger.warn(`Workflow run ${id} was left mid-execution and is marked failed`);
    }
  }

  /**
   * `nextRunAt` is advanced by the same amount before the run is created, so a retried or slow tick
   * cannot claim the same fire twice (Changes -> Rules item 6, SCHEDULE).
   */
  private async claimDueSchedules(now: Date) {
    const due = await this.prisma.channelWorkflow.findMany({
      where: { triggerType: 'SCHEDULE', enabled: true, nextRunAt: { lte: now } },
      take: WORKFLOW_SWEEP_BATCH,
      include: { steps: true },
    });
    for (const workflow of due) {
      const config = workflow.triggerConfig as { intervalMinutes?: number };
      const intervalMinutes = config.intervalMinutes ?? 60;
      const nextRunAt = new Date(now.getTime() + intervalMinutes * 60_000);
      const { count } = await this.prisma.channelWorkflow.updateMany({
        where: { id: workflow.id, nextRunAt: workflow.nextRunAt },
        data: { nextRunAt },
      });
      // Another instance claimed this tick, or the workflow was disabled/edited in between.
      if (count === 0) continue;
      await createWorkflowRun(
        this.prisma,
        {
          id: workflow.id,
          serverId: workflow.serverId,
          steps: toStepSnapshot(workflow.steps) as unknown as Prisma.InputJsonValue,
        },
        { triggerType: 'SCHEDULE', causeRunId: null, depth: 0 },
      );
    }
  }

  /** A disabled workflow's `PENDING` run is left alone: the filter below never selects it. */
  private async claimAndExecutePendingRuns(now: Date) {
    const due = await this.prisma.workflowRun.findMany({
      where: { status: 'PENDING', workflow: { enabled: true } },
      orderBy: { createdAt: 'asc' },
      take: WORKFLOW_SWEEP_BATCH,
      select: { id: true },
    });
    for (const { id } of due) {
      const { count } = await this.prisma.workflowRun.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'RUNNING', claimedAt: now, startedAt: now },
      });
      if (count === 0) continue;
      await this.execute(id);
    }
  }

  private async execute(runId: string) {
    try {
      const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run) return;
      const workflow = await this.prisma.channelWorkflow.findUnique({
        where: { id: run.workflowId },
        select: { serverId: true, executorUserId: true, name: true },
      });
      if (!workflow) {
        await this.prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', failureReason: 'INVALID_TARGET', finishedAt: new Date() },
        });
        return;
      }

      const steps = run.stepSnapshot as unknown as WorkflowStepSnapshotEntry[];
      for (const step of steps.slice().sort((left, right) => left.position - right.position)) {
        const outcome = await this.actions.execute(
          {
            serverId: workflow.serverId,
            workflowId: run.workflowId,
            workflowName: workflow.name,
            executorUserId: workflow.executorUserId,
            runId: run.id,
            runDepth: run.depth,
          },
          step,
        );
        if (outcome.status === 'FAILED') {
          await this.prisma.workflowRun.update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              failedStepIndex: step.position,
              failureReason: outcome.reason,
              finishedAt: new Date(),
            },
          });
          return;
        }
      }

      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', finishedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Workflow run ${runId} execution failed`, errorDetail(error));
      // The claim already moved it to RUNNING; leave it for `failStaleClaims` rather than guess at
      // which step, if any, actually completed.
    }
  }
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.stack : error;
}
