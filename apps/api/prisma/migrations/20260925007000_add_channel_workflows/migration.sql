-- Channel workflows (docs/features/channel-workflows.md). Every change is additive: a new UserKind
-- enum value, three new enums, and four new tables. No existing column of User, Server or Channel
-- is touched.
--
-- PostgreSQL 12+ accepts ADD VALUE inside the migration's transaction as long as the new value is
-- not used before commit (the same approach as 20260918007000_add_stage_channels,
-- 20260922003000_add_announcement_channels and 20260925001000_add_decision_channels); nothing below
-- references 'WORKFLOW' until the CREATE TABLE statements that follow it in this same file.
--
-- down():
--   ALTER TABLE "WorkflowRun" DROP CONSTRAINT "WorkflowRun_workflowId_fkey";
--   DROP TABLE "WorkflowRun";
--   ALTER TABLE "WorkflowStep" DROP CONSTRAINT "WorkflowStep_workflowId_fkey";
--   DROP TABLE "WorkflowStep";
--   ALTER TABLE "ChannelWorkflow" DROP CONSTRAINT "ChannelWorkflow_executorUserId_fkey";
--   ALTER TABLE "ChannelWorkflow" DROP CONSTRAINT "ChannelWorkflow_serverId_fkey";
--   DROP TABLE "ChannelWorkflow";
--   ALTER TABLE "WorkflowHttpAllowlistEntry" DROP CONSTRAINT "WorkflowHttpAllowlistEntry_serverId_fkey";
--   DROP TABLE "WorkflowHttpAllowlistEntry";
--   DROP TYPE "WorkflowRunStatus";
--   DROP TYPE "WorkflowActionType";
--   DROP TYPE "WorkflowTriggerType";
--   The 'WORKFLOW' UserKind value is NOT removed: PostgreSQL cannot drop a single enum value without
--   recreating the whole type (same limitation this repo already accepted for 'WEBHOOK', 'BOT',
--   'ANNOUNCEMENT', 'FORUM', 'STAGE' and 'DECISION' before it). Any synthetic executor User row
--   created before rollback keeps kind = 'WORKFLOW' in the database even after the code stops
--   understanding it. Dropping the four tables above is data-destroying for every workflow
--   definition, its run history, and the server's HTTP allowlist.
ALTER TYPE "UserKind" ADD VALUE 'WORKFLOW';

CREATE TYPE "WorkflowTriggerType" AS ENUM ('MESSAGE_MATCHES', 'WEBHOOK_RECEIVED', 'SCHEDULE');

CREATE TYPE "WorkflowActionType" AS ENUM ('POST_MESSAGE', 'HTTP_CALL');

CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- Empty at creation time: no lock-duration concern, no existing rows to backfill.
CREATE TABLE "ChannelWorkflow" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" "WorkflowTriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "webhookTokenHash" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "executorUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelWorkflow_webhookTokenHash_key" ON "ChannelWorkflow"("webhookTokenHash");

CREATE UNIQUE INDEX "ChannelWorkflow_executorUserId_key" ON "ChannelWorkflow"("executorUserId");

CREATE INDEX "ChannelWorkflow_serverId_idx" ON "ChannelWorkflow"("serverId");

CREATE INDEX "ChannelWorkflow_triggerType_enabled_idx" ON "ChannelWorkflow"("triggerType", "enabled");

CREATE INDEX "ChannelWorkflow_nextRunAt_idx" ON "ChannelWorkflow"("nextRunAt");

CREATE TABLE "WorkflowHttpAllowlistEntry" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowHttpAllowlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowHttpAllowlistEntry_serverId_hostname_key" ON "WorkflowHttpAllowlistEntry"("serverId", "hostname");

CREATE INDEX "WorkflowHttpAllowlistEntry_serverId_idx" ON "WorkflowHttpAllowlistEntry"("serverId");

CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "actionType" "WorkflowActionType" NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowStep_workflowId_position_key" ON "WorkflowStep"("workflowId", "position");

CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "triggerType" "WorkflowTriggerType" NOT NULL,
    "idempotencyKey" TEXT,
    "causeRunId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "stepSnapshot" JSONB NOT NULL,
    "failedStepIndex" INTEGER,
    "failureReason" TEXT,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowRun_workflowId_createdAt_idx" ON "WorkflowRun"("workflowId", "createdAt");

-- Stuck-claim recovery, same shape as ScheduledMessage.
CREATE INDEX "WorkflowRun_status_claimedAt_idx" ON "WorkflowRun"("status", "claimedAt");

-- NULLs don't collide in Postgres, so this only dedups WEBHOOK_RECEIVED runs.
CREATE UNIQUE INDEX "WorkflowRun_workflowId_idempotencyKey_key" ON "WorkflowRun"("workflowId", "idempotencyKey");

-- Deleting a server or a workflow cascades its steps and run history. Deleting the executor User
-- row is restricted (default Restrict, no onDelete clause): a workflow's synthetic user is never
-- deleted by deleting the workflow (Changes -> Rules item 10, same precedent as ServerWebhook's
-- webhookUserId before this migration reversed the direction of that FK's cascade -- here it is the
-- workflow that would need deleting first, not the user).
ALTER TABLE "ChannelWorkflow" ADD CONSTRAINT "ChannelWorkflow_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelWorkflow" ADD CONSTRAINT "ChannelWorkflow_executorUserId_fkey" FOREIGN KEY ("executorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkflowHttpAllowlistEntry" ADD CONSTRAINT "WorkflowHttpAllowlistEntry_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ChannelWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ChannelWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
