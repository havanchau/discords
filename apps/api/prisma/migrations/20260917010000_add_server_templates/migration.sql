-- Server templates (slice A). Only a new table; no existing table is touched.
-- A snapshot of a server's structure. The JSON columns reference each other by array index; a
-- template outlives its source server (SET NULL) but not its creator's account (CASCADE).
CREATE TABLE "ServerTemplate" (
    "id" TEXT NOT NULL,
    "sourceServerId" TEXT,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "roles" JSONB NOT NULL,
    "categories" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "onboarding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerTemplate_creatorId_createdAt_idx" ON "ServerTemplate"("creatorId", "createdAt");

CREATE INDEX "ServerTemplate_sourceServerId_idx" ON "ServerTemplate"("sourceServerId");

ALTER TABLE "ServerTemplate" ADD CONSTRAINT "ServerTemplate_sourceServerId_fkey" FOREIGN KEY ("sourceServerId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServerTemplate" ADD CONSTRAINT "ServerTemplate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
