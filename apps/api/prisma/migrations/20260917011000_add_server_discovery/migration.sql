-- Public discovery (slice B). Independent of 20260917010000_add_server_templates.
-- Constant defaults, so on PostgreSQL 11+ none of these ADD COLUMNs rewrites "Server".
ALTER TABLE "Server" ADD COLUMN     "discoveryInviteId" TEXT,
ADD COLUMN     "listed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Builds while "Server" is locked against writes; the table holds one row per server, so this is short.
CREATE INDEX "Server_listed_deletedAt_idx" ON "Server"("listed", "deletedAt");

-- A report against a listed server; reuses the existing "MessageReportReason" enum.
CREATE TABLE "ServerReport" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "MessageReportReason" NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerReport_serverId_createdAt_idx" ON "ServerReport"("serverId", "createdAt");

CREATE INDEX "ServerReport_reporterId_serverId_createdAt_idx" ON "ServerReport"("reporterId", "serverId", "createdAt");

ALTER TABLE "ServerReport" ADD CONSTRAINT "ServerReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerReport" ADD CONSTRAINT "ServerReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
