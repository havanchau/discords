-- Last refresh time per session, shown in the Devices list. Existing rows start at migration time.
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
