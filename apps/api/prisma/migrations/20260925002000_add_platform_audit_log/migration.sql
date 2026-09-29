-- Platform audit log (docs/features/platform-audit-log.md). New table only; no existing column,
-- index, or constraint is touched. Empty at creation, so no lock-duration concern.
--
-- down():
--   DROP TABLE "PlatformAuditLog";
--   DROP TYPE "PlatformAuditTargetType";
--   DROP TYPE "PlatformAuditAction";
--   Dropping the table is data-destroying for every row recorded before rollback; there is no
--   application-level backup of this table's contents beyond a database snapshot.

CREATE TYPE "PlatformAuditAction" AS ENUM (
  'SERVER_DELETE',
  'SERVER_OWNERSHIP_TRANSFER',
  'PLATFORM_REPORT_DISMISS',
  'PLATFORM_REPORT_DELIST',
  'ACCOUNT_DELETION'
);

CREATE TYPE "PlatformAuditTargetType" AS ENUM ('SERVER', 'USER', 'REPORT');

CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "action" "PlatformAuditAction" NOT NULL,
    "actorId" TEXT,
    "actorUsername" TEXT,
    "actorDisplayName" TEXT,
    "targetType" "PlatformAuditTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");
CREATE INDEX "PlatformAuditLog_targetId_idx" ON "PlatformAuditLog"("targetId");
CREATE INDEX "PlatformAuditLog_actorId_idx" ON "PlatformAuditLog"("actorId");
