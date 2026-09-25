-- Decision channels (docs/features/decision-channels.md). Every change is additive: a new
-- ChannelType value, a new DecisionStatus enum, and a new Decision table. No existing column of
-- Channel, Thread, Message or User is touched.
--
-- PostgreSQL 12+ accepts ADD VALUE inside the migration's transaction as long as the new value is
-- not used before commit (the same approach as 20260918007000_add_stage_channels and
-- 20260922003000_add_announcement_channels); nothing below references 'DECISION'.
--
-- down():
--   ALTER TABLE "Decision" DROP CONSTRAINT "Decision_supersededByDecisionId_fkey";
--   ALTER TABLE "Decision" DROP CONSTRAINT "Decision_decidedById_fkey";
--   ALTER TABLE "Decision" DROP CONSTRAINT "Decision_proposerId_fkey";
--   ALTER TABLE "Decision" DROP CONSTRAINT "Decision_threadId_fkey";
--   ALTER TABLE "Decision" DROP CONSTRAINT "Decision_channelId_fkey";
--   DROP TABLE "Decision";
--   DROP TYPE "DecisionStatus";
--   The 'DECISION' enum value is NOT removed: PostgreSQL cannot drop an enum value without
--   recreating the type. Any DECISION channel created before rollback keeps that type in the
--   database even after the code stops understanding it (same limitation as ANNOUNCEMENT and FORUM
--   before it). Dropping the Decision table is data-destroying for every proposal, vote-linking
--   record (poll votes themselves live on Poll/PollVote and are untouched), and resolution history
--   recorded in it.
ALTER TYPE "ChannelType" ADD VALUE 'DECISION';

CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- Empty at creation time: no lock-duration concern, no existing rows to backfill.
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "votingDeadlineAt" TIMESTAMP(3) NOT NULL,
    "quorumCount" INTEGER,
    "expiredAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "supersededByDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- One Decision per Thread (the proposal's post) and at most one old decision superseded by a given
-- new decision.
CREATE UNIQUE INDEX "Decision_threadId_key" ON "Decision"("threadId");
CREATE UNIQUE INDEX "Decision_supersededByDecisionId_key" ON "Decision"("supersededByDecisionId");

-- Channel-scoped listing, the deadline sweep's due-proposal scan, and the expired-but-unresolved scan.
CREATE INDEX "Decision_channelId_status_idx" ON "Decision"("channelId", "status");
CREATE INDEX "Decision_status_votingDeadlineAt_idx" ON "Decision"("status", "votingDeadlineAt");
CREATE INDEX "Decision_status_expiredAt_idx" ON "Decision"("status", "expiredAt");

-- Deleting a channel or its proposal thread deletes the Decision row with it (verified cascade
-- chain, docs/features/decision-channels.md → Current behavior).
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_supersededByDecisionId_fkey" FOREIGN KEY ("supersededByDecisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
