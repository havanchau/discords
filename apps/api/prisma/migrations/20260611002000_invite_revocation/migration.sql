ALTER TABLE "Invite" ADD COLUMN "revokedAt" TIMESTAMP(3);
CREATE INDEX "Invite_serverId_revokedAt_expiresAt_idx" ON "Invite"("serverId", "revokedAt", "expiresAt");
CREATE INDEX "Invite_creatorId_idx" ON "Invite"("creatorId");
