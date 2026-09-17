-- What a report points at, why it was filed, and where it is in the moderator queue.
CREATE TYPE "MessageReportTargetType" AS ENUM ('MESSAGE', 'USER');
CREATE TYPE "MessageReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'NSFW', 'HATE_SPEECH', 'OTHER');
CREATE TYPE "MessageReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- A member's report on a server message or member. messageId, targetUserId and resolvedById are
-- SET NULL on delete, so the report outlives the message and the accounts it names.
CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "MessageReportTargetType" NOT NULL,
    "messageId" TEXT,
    "targetUserId" TEXT,
    "reason" "MessageReportReason" NOT NULL,
    "details" TEXT,
    "status" "MessageReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- The moderator queue: one server's reports in one status, newest first.
CREATE INDEX "MessageReport_serverId_status_createdAt_idx" ON "MessageReport"("serverId", "status", "createdAt");
-- The duplicate check: does this reporter already have an open report on this target.
CREATE INDEX "MessageReport_reporterId_messageId_status_idx" ON "MessageReport"("reporterId", "messageId", "status");

ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
