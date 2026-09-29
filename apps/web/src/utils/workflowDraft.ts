import type {
  WorkflowActionType,
  WorkflowHttpMethod,
  WorkflowTriggerType,
} from '@discord-clone/shared';
import type { CreateWorkflowInput, WorkflowStepInput, WorkflowView } from '@/api';

/** One step's editable state; only the fields its `actionType` uses are sent. */
export interface WorkflowStepDraft {
  actionType: WorkflowActionType;
  channelId: string;
  content: string;
  url: string;
  method: WorkflowHttpMethod;
  body: string;
  secretHeaderName: string;
  secretHeaderValue: string;
  /** True when editing a step that already has a sealed secret and the value field is left empty. */
  keepExistingSecret: boolean;
}

export interface WorkflowDraft {
  name: string;
  triggerType: WorkflowTriggerType;
  channelId: string;
  termsText: string;
  intervalMinutes: string;
  steps: WorkflowStepDraft[];
}

export function emptyStepDraft(): WorkflowStepDraft {
  return {
    actionType: 'POST_MESSAGE',
    channelId: '',
    content: '',
    url: '',
    method: 'POST',
    body: '',
    secretHeaderName: '',
    secretHeaderValue: '',
    keepExistingSecret: false,
  };
}

export function draftFromWorkflow(workflow: WorkflowView | null): WorkflowDraft {
  const trigger = workflow?.triggerConfig as
    | { channelId?: string; terms?: string[]; intervalMinutes?: number }
    | undefined;
  return {
    name: workflow?.name ?? '',
    triggerType: workflow?.triggerType ?? 'MESSAGE_MATCHES',
    channelId: trigger?.channelId ?? '',
    termsText: trigger?.terms?.join('\n') ?? '',
    intervalMinutes: String(trigger?.intervalMinutes ?? 60),
    steps: workflow?.steps.length
      ? workflow.steps.map((step) => {
          const config = step.config as {
            channelId?: string;
            content?: string;
            url?: string;
            method?: WorkflowHttpMethod;
            body?: string;
            secretHeaderName?: string | null;
            hasSecret?: boolean;
          };
          return {
            actionType: step.actionType,
            channelId: config.channelId ?? '',
            content: config.content ?? '',
            url: config.url ?? '',
            method: config.method ?? 'POST',
            body: config.body ?? '',
            secretHeaderName: config.secretHeaderName ?? '',
            secretHeaderValue: '',
            keepExistingSecret: Boolean(config.hasSecret),
          };
        })
      : [emptyStepDraft()],
  };
}

export function inputFromDraft(draft: WorkflowDraft): CreateWorkflowInput {
  return {
    name: draft.name.trim(),
    triggerType: draft.triggerType,
    ...(draft.triggerType === 'MESSAGE_MATCHES'
      ? { channelId: draft.channelId, terms: splitLines(draft.termsText) }
      : {}),
    ...(draft.triggerType === 'SCHEDULE' ? { intervalMinutes: Number(draft.intervalMinutes) } : {}),
    steps: draft.steps.map((step): WorkflowStepInput => {
      if (step.actionType === 'POST_MESSAGE') {
        return {
          actionType: 'POST_MESSAGE',
          channelId: step.channelId,
          content: step.content.trim(),
        };
      }
      return {
        actionType: 'HTTP_CALL',
        url: step.url.trim(),
        method: step.method,
        ...(step.body.trim() ? { body: step.body.trim() } : {}),
        ...(step.secretHeaderName.trim() && step.secretHeaderValue
          ? {
              secretHeaderName: step.secretHeaderName.trim(),
              secretHeaderValue: step.secretHeaderValue,
            }
          : {}),
        ...(step.keepExistingSecret && !step.secretHeaderValue ? { keepExistingSecret: true } : {}),
      };
    }),
  };
}

function splitLines(text: string) {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}
