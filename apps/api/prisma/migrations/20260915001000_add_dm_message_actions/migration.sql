-- Replies and pins for direct messages.
ALTER TABLE "DirectMessage" ADD COLUMN "replyToMessageId" TEXT,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "pinnedById" TEXT;

CREATE INDEX "DirectMessage_conversationId_pinnedAt_idx" ON "DirectMessage"("conversationId", "pinnedAt");

-- Emoji reactions on direct messages, one row per user and emoji.
CREATE TABLE "DirectMessageReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessageReaction_pkey" PRIMARY KEY ("messageId","userId","emoji")
);

ALTER TABLE "DirectMessageReaction" ADD CONSTRAINT "DirectMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageReaction" ADD CONSTRAINT "DirectMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
