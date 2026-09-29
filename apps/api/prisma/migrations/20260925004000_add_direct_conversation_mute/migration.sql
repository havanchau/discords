-- Per-user, per-conversation DM push mute (docs/features/dm-conversation-mute.md). Suppresses only
-- PushService.sendDirectMessagePush for that one conversation; the in-app Notification row, unread
-- count, and conversation-list ordering are untouched. Same "muted + optional expiry" shape as
-- NotificationPreference (mutedUntil NULL + muted = forever, a past value = expired), stored in a
-- dedicated table because a DM has no server/channel scope column to reuse (see doc, Trade-offs).
-- New empty table: no lock or backfill concern.
--
-- down():
--   ALTER TABLE "DirectConversationMute" DROP CONSTRAINT "DirectConversationMute_conversationId_fkey";
--   ALTER TABLE "DirectConversationMute" DROP CONSTRAINT "DirectConversationMute_userId_fkey";
--   DROP TABLE "DirectConversationMute";
--   Data-destroying: any row written before rollback (a user's per-conversation mute) is lost. This
--   fails open to "not muted" for the affected conversation, not a data-loss risk for any other table.
CREATE TABLE "DirectConversationMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectConversationMute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectConversationMute_userId_conversationId_key" ON "DirectConversationMute"("userId", "conversationId");
CREATE INDEX "DirectConversationMute_conversationId_idx" ON "DirectConversationMute"("conversationId");

ALTER TABLE "DirectConversationMute" ADD CONSTRAINT "DirectConversationMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectConversationMute" ADD CONSTRAINT "DirectConversationMute_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
