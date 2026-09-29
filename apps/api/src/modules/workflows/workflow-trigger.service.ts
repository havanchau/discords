import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { createWorkflowRun } from './workflow-run-limits';
import { toStepSnapshot } from './workflow-view';
import { workflowTokenMatches } from './workflow-token';

/** How long one instance trusts its copy of a server's MESSAGE_MATCHES triggers (AutoMod's TTL). */
const TRIGGER_CACHE_TTL_MS = 15_000;
const TRIGGER_CACHE_MAX_SERVERS = 2_000;

interface CompiledMessageMatchTrigger {
  workflowId: string;
  serverId: string;
  channelId: string;
  terms: string[];
  steps: ReturnType<typeof toStepSnapshot>;
}

interface CachedServerTriggers {
  expiresAt: number;
  triggers: CompiledMessageMatchTrigger[];
}

export interface WorkflowMessageForEvaluation {
  id: string;
  serverId: string;
  channelId: string;
  content: string;
}

/** Set when a message was posted by a workflow's own POST_MESSAGE step, never for a real send. */
export interface WorkflowRunCause {
  causeRunId: string;
  depth: number;
}

/**
 * The two non-schedule triggers: a channel message that matches a `MESSAGE_MATCHES` workflow, and a
 * caller posting to a `WEBHOOK_RECEIVED` workflow's token URL. `SCHEDULE` is claimed directly by
 * `WorkflowRunSweepService`, which needs no cache (it already scans by `nextRunAt`).
 */
@Injectable()
export class WorkflowTriggerService {
  private readonly logger = new Logger(WorkflowTriggerService.name);
  private readonly cache = new Map<string, CachedServerTriggers>();

  constructor(private readonly prisma: PrismaService) {}

  invalidate(serverId: string) {
    this.cache.delete(serverId);
  }

  /**
   * Called after AutoMod succeeds on a message create (`workflow-actions.ts`'s `postMessage` step
   * calls it directly too, since that step bypasses `MessagesService.createMessage`). Never rejects:
   * a workflow evaluation failure is logged, never the send.
   */
  async evaluateMessage(message: WorkflowMessageForEvaluation, cause?: WorkflowRunCause) {
    try {
      const server = await this.loadServerTriggers(message.serverId);
      const matches = server.triggers.filter(
        (trigger) =>
          trigger.channelId === message.channelId && matchesTerms(trigger.terms, message.content),
      );
      for (const trigger of matches) {
        await createWorkflowRun(
          this.prisma,
          {
            id: trigger.workflowId,
            serverId: trigger.serverId,
            steps: trigger.steps as unknown as Prisma.InputJsonValue,
          },
          {
            triggerType: 'MESSAGE_MATCHES',
            causeRunId: cause?.causeRunId ?? null,
            depth: cause?.depth ?? 0,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Workflow message evaluation failed for message ${message.id}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * `POST /workflow-triggers/:workflowId/:token`. Unknown id, wrong token, disabled workflow, or a
   * non-WEBHOOK_RECEIVED workflow are all the same 404 (Edge cases): a caller cannot fingerprint
   * which part of the URL was wrong. Called by the controller only after its own per-workflow rate
   * limit (keyed on the authenticated workflow's id, never a pre-auth guess) allowed the request.
   */
  async authenticate(workflowId: string, token: string) {
    const workflow = await this.prisma.channelWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });
    // Hash the token even when the id is unknown, so response time does not reveal valid ids.
    const tokenMatches = workflowTokenMatches(token, workflow?.webhookTokenHash ?? '');
    if (
      !workflow ||
      !tokenMatches ||
      workflow.triggerType !== 'WEBHOOK_RECEIVED' ||
      !workflow.enabled
    ) {
      throw new NotFoundException('Not found');
    }
    return workflow;
  }

  async receiveWebhook(
    workflow: Awaited<ReturnType<WorkflowTriggerService['authenticate']>>,
    idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Idempotency key required');

    try {
      const run = await createWorkflowRun(
        this.prisma,
        {
          id: workflow.id,
          serverId: workflow.serverId,
          steps: toStepSnapshot(workflow.steps) as unknown as Prisma.InputJsonValue,
        },
        { triggerType: 'WEBHOOK_RECEIVED', idempotencyKey, causeRunId: null, depth: 0 },
      );
      return { runId: run.id, status: run.status };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.workflowRun.findUnique({
          where: { workflowId_idempotencyKey: { workflowId: workflow.id, idempotencyKey } },
        });
        // The unique constraint just fired, so the row exists; a null here would mean it was
        // deleted in the same instant, which nothing in this feature ever does.
        if (existing) return { runId: existing.id, status: existing.status };
      }
      throw error;
    }
  }

  /** One query per server per TTL window per instance, never one per message. */
  private async loadServerTriggers(serverId: string): Promise<CachedServerTriggers> {
    const now = Date.now();
    const cached = this.cache.get(serverId);
    if (cached && cached.expiresAt > now) return cached;

    const workflows = await this.prisma.channelWorkflow.findMany({
      where: { serverId, enabled: true, triggerType: 'MESSAGE_MATCHES' },
      include: { steps: true },
    });
    const entry: CachedServerTriggers = {
      expiresAt: now + TRIGGER_CACHE_TTL_MS,
      triggers: workflows.flatMap((workflow) => {
        const config = workflow.triggerConfig as { channelId?: string; terms?: string[] };
        if (!config.channelId || !config.terms?.length) return [];
        return [
          {
            workflowId: workflow.id,
            serverId: workflow.serverId,
            channelId: config.channelId,
            terms: config.terms.map((term) => term.toLowerCase()),
            steps: toStepSnapshot(workflow.steps),
          },
        ];
      }),
    };

    this.cache.delete(serverId);
    if (this.cache.size >= TRIGGER_CACHE_MAX_SERVERS) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(serverId, entry);
    return entry;
  }
}

function matchesTerms(terms: string[], content: string): boolean {
  const lowered = content.toLowerCase();
  return terms.some((term) => lowered.includes(term));
}

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
  );
}
