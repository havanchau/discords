-- Announcement channels (docs/features/announcement-channels.md). Every change is additive.
--
-- PostgreSQL 12+ accepts ADD VALUE inside the migration's transaction as long as the new value is not
-- used before commit (the same approach as 20260918007000_add_stage_channels); nothing below
-- references 'ANNOUNCEMENT'.
--
-- down():
--   ALTER TABLE "ServerWebhook" DROP CONSTRAINT "ServerWebhook_sourceChannelId_fkey";
--   DROP INDEX "ServerWebhook_sourceChannelId_idx";
--   DELETE FROM "ServerWebhook" WHERE "sourceChannelId" IS NOT NULL;
--   ALTER TABLE "ServerWebhook" DROP COLUMN "sourceChannelId";
--   ALTER TABLE "Message" DROP COLUMN "publishedAt";
--   ALTER TABLE "Message" DROP COLUMN "isCrosspost";
--   The DELETE removes every follow first: without its source column a follow row would read as an
--   ordinary incoming webhook with an unusable token. Crossposted copies stay as ordinary messages but
--   lose their "crossposted" and "published" marks. Data-destroying for follows and those marks.
--   The 'ANNOUNCEMENT' enum value is NOT removed: PostgreSQL cannot drop an enum value without
--   recreating the type. Channels created with it keep that type after a code rollback.
ALTER TYPE "ChannelType" ADD VALUE 'ANNOUNCEMENT';

-- Both columns are nullable or have a constant default: metadata-only on PostgreSQL 11+, no rewrite.
-- Existing rows read as "never published" and "not a copy", which is true for all of them.
ALTER TABLE "Message" ADD COLUMN "isCrosspost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Null on every existing row: each one is an ordinary incoming webhook.
ALTER TABLE "ServerWebhook" ADD COLUMN "sourceChannelId" TEXT;

-- Publish fans out by source channel; the cascade below deletes by it too.
CREATE INDEX "ServerWebhook_sourceChannelId_idx" ON "ServerWebhook"("sourceChannelId");

-- Deleting the source channel removes its follows, as deleting the target channel already does.
ALTER TABLE "ServerWebhook" ADD CONSTRAINT "ServerWebhook_sourceChannelId_fkey" FOREIGN KEY ("sourceChannelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
