-- Account deletion grace period. All three columns are nullable, so no backfill and no table rewrite.
ALTER TABLE "User" ADD COLUMN     "deletionCompletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledAt" TIMESTAMP(3);

-- The deletion sweep selects due rows by this column.
CREATE INDEX "User_deletionScheduledAt_idx" ON "User"("deletionScheduledAt");

-- A self-service data export. The archive is stored privately under fileKey; the row cascades with
-- its owner, although owners are anonymized rather than deleted.
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "fileKey" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExportJob_userId_createdAt_idx" ON "ExportJob"("userId", "createdAt");

-- The expiry sweep selects READY rows whose link has passed expiresAt.
CREATE INDEX "ExportJob_status_expiresAt_idx" ON "ExportJob"("status", "expiresAt");

ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
