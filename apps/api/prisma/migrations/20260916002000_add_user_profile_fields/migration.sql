-- Account-level profile presentation, plus a per-server avatar beside the existing nickname.
-- All columns are nullable, so a populated table needs no backfill and no default.
ALTER TABLE "User" ADD COLUMN "bannerUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "pronouns" TEXT;
ALTER TABLE "User" ADD COLUMN "customStatusText" TEXT;
ALTER TABLE "User" ADD COLUMN "customStatusEmoji" TEXT;
ALTER TABLE "User" ADD COLUMN "customStatusExpiresAt" TIMESTAMP(3);

ALTER TABLE "ServerMember" ADD COLUMN "avatarUrl" TEXT;
