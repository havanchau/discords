-- Lifecycle of a scheduled message. A cancelled one is deleted, so there is no CANCELLED value.
CREATE TYPE "ScheduledMessageStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- A message composed now and posted by the API at sendAt. The destination is exactly one of
-- channelId / conversationId, enforced by the service. attachments holds the validated send input.
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "channelId" TEXT,
    "conversationId" TEXT,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "replyToMessageId" TEXT,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledMessageStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "sentMessageId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- The sweep's lookup: due pending rows, and stale SENDING claims.
CREATE INDEX "ScheduledMessage_status_sendAt_idx" ON "ScheduledMessage"("status", "sendAt");
-- The author's list and pending cap per destination.
CREATE INDEX "ScheduledMessage_authorId_channelId_status_idx" ON "ScheduledMessage"("authorId", "channelId", "status");
CREATE INDEX "ScheduledMessage_authorId_conversationId_status_idx" ON "ScheduledMessage"("authorId", "conversationId", "status");

-- Deleting the author, channel or conversation removes its scheduled messages.
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
