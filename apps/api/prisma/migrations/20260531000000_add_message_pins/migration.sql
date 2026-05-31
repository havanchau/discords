-- Persist pinned channel messages server-side.
CREATE TABLE "MessagePin" (
  "messageId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "pinnedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessagePin_pkey" PRIMARY KEY ("messageId")
);

CREATE INDEX "MessagePin_channelId_createdAt_idx" ON "MessagePin"("channelId", "createdAt");

ALTER TABLE "MessagePin"
  ADD CONSTRAINT "MessagePin_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagePin"
  ADD CONSTRAINT "MessagePin_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagePin"
  ADD CONSTRAINT "MessagePin_pinnedById_fkey"
  FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
