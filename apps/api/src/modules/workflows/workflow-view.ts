import type { ChannelWorkflow, WorkflowRun, WorkflowStep } from '@prisma/client';
import type {
  HttpCallStepView,
  PostMessageStepConfig,
  WorkflowRunView,
  WorkflowStepView,
  WorkflowTriggerConfig,
  WorkflowView,
} from '@discord-clone/shared';

export interface StoredHttpCallStepConfig {
  url: string;
  method: 'GET' | 'POST';
  body?: string;
  secretHeader?: { name: string; sealedValue: string };
}

export type StoredStepConfig = PostMessageStepConfig | StoredHttpCallStepConfig;

type WorkflowWithSteps = ChannelWorkflow & { steps: WorkflowStep[] };

/** The one place a workflow becomes the shape the client reads; a sealed secret never leaves here. */
export function toWorkflowView(workflow: WorkflowWithSteps, channelExists: boolean): WorkflowView {
  return {
    id: workflow.id,
    serverId: workflow.serverId,
    name: workflow.name,
    enabled: workflow.enabled,
    triggerType: workflow.triggerType,
    triggerConfig: workflow.triggerConfig as WorkflowTriggerConfig,
    hasWebhookToken: workflow.webhookTokenHash !== null,
    nextRunAt: workflow.nextRunAt,
    createdById: workflow.createdById,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    steps: workflow.steps
      .slice()
      .sort((left, right) => left.position - right.position)
      .map(toStepView),
    channelMissing: workflow.triggerType === 'MESSAGE_MATCHES' ? !channelExists : false,
  };
}

function toStepView(step: WorkflowStep): WorkflowStepView {
  const config = step.config as unknown as StoredStepConfig;
  return {
    position: step.position,
    actionType: step.actionType,
    config:
      step.actionType === 'HTTP_CALL'
        ? toHttpCallView(config as StoredHttpCallStepConfig)
        : (config as PostMessageStepConfig),
  };
}

function toHttpCallView(config: StoredHttpCallStepConfig): HttpCallStepView {
  return {
    url: config.url,
    method: config.method,
    body: config.body,
    secretHeaderName: config.secretHeader?.name ?? null,
    hasSecret: config.secretHeader !== undefined,
  };
}

export interface WorkflowStepSnapshotEntry {
  position: number;
  actionType: WorkflowStep['actionType'];
  config: StoredStepConfig;
}

/** Every step, sorted, ready to be stored as `WorkflowRun.stepSnapshot` at claim time. */
export function toStepSnapshot(steps: WorkflowStep[]): WorkflowStepSnapshotEntry[] {
  return steps
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((step) => ({
      position: step.position,
      actionType: step.actionType,
      config: step.config as unknown as StoredStepConfig,
    }));
}

export function toWorkflowRunView(run: WorkflowRun): WorkflowRunView {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    triggerType: run.triggerType,
    causeRunId: run.causeRunId,
    depth: run.depth,
    failedStepIndex: run.failedStepIndex,
    failureReason: run.failureReason,
    claimedAt: run.claimedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
  };
}
