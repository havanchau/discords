/**
 * Channel workflows: no-code automation (docs/features/channel-workflows.md). Limits shared by the
 * settings form and the API, the per-type trigger/step config shapes, and the settings API shapes.
 * The public trigger endpoint is `POST /workflow-triggers/:workflowId/:token`.
 */

export const workflowTriggerTypes = ['MESSAGE_MATCHES', 'WEBHOOK_RECEIVED', 'SCHEDULE'] as const;
export type WorkflowTriggerType = (typeof workflowTriggerTypes)[number];

export const workflowActionTypes = ['POST_MESSAGE', 'HTTP_CALL'] as const;
export type WorkflowActionType = (typeof workflowActionTypes)[number];

export const workflowRunStatuses = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const workflowFailureReasons = [
  'CHAIN_DEPTH_EXCEEDED',
  'RATE_LIMITED',
  'INVALID_TARGET',
  'AUTOMOD_BLOCKED',
  'BLOCKED_ADDRESS',
  'HTTP_TIMEOUT',
  'RESPONSE_TOO_LARGE',
  'HOST_NOT_ALLOWED',
  'UNKNOWN',
] as const;
export type WorkflowFailureReason = (typeof workflowFailureReasons)[number];

export const WORKFLOW_MAX_PER_SERVER = 25;
export const WORKFLOW_MIN_STEPS = 1;
export const WORKFLOW_MAX_STEPS = 5;
export const WORKFLOW_NAME_MAX_LENGTH = 100;

export const WORKFLOW_MESSAGE_MATCH_MAX_TERMS = 20;
export const WORKFLOW_MESSAGE_MATCH_TERM_MAX_LENGTH = 100;

export const WORKFLOW_SCHEDULE_MIN_MINUTES = 60;
export const WORKFLOW_SCHEDULE_MAX_MINUTES = 10_080;

export const WORKFLOW_POST_MESSAGE_MAX_LENGTH = 2000;

export const WORKFLOW_HTTP_URL_MAX_LENGTH = 2048;
export const WORKFLOW_HTTP_BODY_MAX_BYTES = 8192;
export const WORKFLOW_HTTP_SECRET_HEADER_NAME_MAX_LENGTH = 100;
export const WORKFLOW_HTTP_SECRET_HEADER_VALUE_MAX_LENGTH = 4096;
export const WORKFLOW_HTTP_RESPONSE_EXCERPT_MAX_LENGTH = 500;
export const WORKFLOW_HTTP_TIMEOUT_MS = 10_000;
export const WORKFLOW_HTTP_MAX_REDIRECTS = 5;
export const WORKFLOW_HTTP_MAX_RESPONSE_BYTES = 65_536;

export const WORKFLOW_ALLOWLIST_HOSTNAME_MAX_LENGTH = 253;

export const WORKFLOW_MAX_CHAIN_DEPTH = 5;
export const WORKFLOW_MAX_CONCURRENT_RUNS_PER_WORKFLOW = 3;
export const WORKFLOW_MAX_CONCURRENT_RUNS_PER_SERVER = 50;
export const WORKFLOW_RUN_HISTORY_MAX = 50;

export const WORKFLOW_SWEEP_INTERVAL_MS = 5_000;
export const WORKFLOW_SWEEP_BATCH = 50;
export const WORKFLOW_STALE_CLAIM_MS = 60_000;

/** Runs accepted per token per minute, counted across API instances. */
export const WORKFLOW_TRIGGER_POSTS_PER_MINUTE = 30;

// ---- Trigger configs -------------------------------------------------------------------------

export interface MessageMatchesTriggerConfig {
  channelId: string;
  /** Case-insensitive substring match, same shape as AutoModRule.terms. */
  terms: string[];
}

export interface ScheduleTriggerConfig {
  intervalMinutes: number;
}

/** WEBHOOK_RECEIVED carries no config fields; the token is issued and stored separately. */
export type WebhookReceivedTriggerConfig = Record<string, never>;

export type WorkflowTriggerConfig =
  | MessageMatchesTriggerConfig
  | ScheduleTriggerConfig
  | WebhookReceivedTriggerConfig;

// ---- Step configs -----------------------------------------------------------------------------

export interface PostMessageStepConfig {
  channelId: string;
  content: string;
}

export type WorkflowHttpMethod = 'GET' | 'POST';

/** The shape a read endpoint returns; the secret value is never in the response. */
export interface HttpCallStepView {
  url: string;
  method: WorkflowHttpMethod;
  body?: string;
  secretHeaderName: string | null;
  hasSecret: boolean;
}

export type WorkflowStepViewConfig = PostMessageStepConfig | HttpCallStepView;

export interface WorkflowStepView {
  position: number;
  actionType: WorkflowActionType;
  config: WorkflowStepViewConfig;
}

// ---- Workflow CRUD shapes ----------------------------------------------------------------------
//
// The create/update request bodies are flat, one field per possible trigger/action shape (mirroring
// `CreateAutoModRuleDto`'s "one flat DTO, per-type fields optional" idiom) -- unlike the *View*
// shapes above, which nest `triggerConfig`/`config` because that is what is actually stored and
// read back. `WorkflowStepInput`'s fields depend on `actionType`, checked by `WorkflowsService`.

export interface WorkflowStepInput {
  actionType: WorkflowActionType;
  /** POST_MESSAGE */
  channelId?: string;
  /** POST_MESSAGE */
  content?: string;
  /** HTTP_CALL */
  url?: string;
  /** HTTP_CALL */
  method?: WorkflowHttpMethod;
  /** HTTP_CALL, optional */
  body?: string;
  /** HTTP_CALL, optional */
  secretHeaderName?: string;
  /** HTTP_CALL, optional; plaintext, sealed by the API before storage. */
  secretHeaderValue?: string;
  /** HTTP_CALL, update only: keep the previously-sealed secret when its value is left empty. */
  keepExistingSecret?: boolean;
}

export interface CreateWorkflowInput {
  name: string;
  triggerType: WorkflowTriggerType;
  /** MESSAGE_MATCHES */
  channelId?: string;
  /** MESSAGE_MATCHES */
  terms?: string[];
  /** SCHEDULE */
  intervalMinutes?: number;
  steps: WorkflowStepInput[];
}

export interface UpdateWorkflowInput extends Partial<Omit<CreateWorkflowInput, 'steps'>> {
  enabled?: boolean;
  steps?: WorkflowStepInput[];
}

export interface WorkflowView {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
  triggerType: WorkflowTriggerType;
  triggerConfig: WorkflowTriggerConfig;
  /** Whether a WEBHOOK_RECEIVED trigger currently has an issued token; the token itself never returns. */
  hasWebhookToken: boolean;
  nextRunAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  steps: WorkflowStepView[];
  /**
   * Computed at read time, never stored: true when a MESSAGE_MATCHES trigger's channelId no longer
   * resolves to a channel of this server (Edge cases, "channel missing" badge).
   */
  channelMissing: boolean;
}

/** `201`/`PATCH` response for a WEBHOOK_RECEIVED workflow; shown once, mirroring incoming webhooks. */
export interface WorkflowTriggerUrl {
  triggerUrl: string;
}

export interface CreateWorkflowResult {
  workflow: WorkflowView;
  triggerUrl?: string;
}

export interface WorkflowRunView {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggerType: WorkflowTriggerType;
  causeRunId: string | null;
  depth: number;
  failedStepIndex: number | null;
  /** One of `workflowFailureReasons`, or another literal thrown by a future action type. */
  failureReason: string | null;
  claimedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

// ---- HTTP allowlist -----------------------------------------------------------------------------

export interface WorkflowHttpAllowlistEntryView {
  id: string;
  hostname: string;
  createdAt: Date;
}

export interface AddWorkflowHttpAllowlistEntryInput {
  hostname: string;
}

/** Body of `POST /workflow-triggers/:workflowId/:token`; `payload` is unused in v1 (no templating). */
export interface WorkflowTriggerInput {
  payload?: Record<string, unknown>;
}

export interface WorkflowTriggerResult {
  runId: string;
  status: WorkflowRunStatus;
}
