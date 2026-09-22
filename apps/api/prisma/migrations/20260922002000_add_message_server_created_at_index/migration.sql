-- Server insights (docs/features/server-insights.md): messages per UTC day and per channel for one
-- server, filtered on "serverId" and a "createdAt" lower bound. No data change.
-- Lock: a plain CREATE INDEX blocks writes to "Message" (reads continue) for the whole build. On a
-- large production table, confirm the deploy window first, or create it by hand beforehand with
-- CREATE INDEX CONCURRENTLY ... outside a transaction (Prisma runs this file in one) and then
-- `prisma migrate resolve --applied` this migration.
-- down(): DROP INDEX "Message_serverId_createdAt_idx";  (lossless: only an index is removed.)
CREATE INDEX "Message_serverId_createdAt_idx" ON "Message"("serverId", "createdAt");
