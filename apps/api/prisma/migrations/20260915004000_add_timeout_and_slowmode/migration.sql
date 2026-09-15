-- Member timeouts are stored as an absolute UTC instant; a past value means "not timed out".
ALTER TABLE "ServerMember" ADD COLUMN "timeoutUntil" TIMESTAMP(3);

-- Per-channel cooldown between a member's own top-level messages. 0 disables slowmode.
ALTER TABLE "Channel" ADD COLUMN "slowmodeSeconds" INTEGER NOT NULL DEFAULT 0;

-- Supports the "author's latest message in this channel" slowmode lookup.
-- On a large production Message table, create this index with CONCURRENTLY outside a transaction.
CREATE INDEX "Message_channelId_authorId_createdAt_idx" ON "Message"("channelId", "authorId", "createdAt");
