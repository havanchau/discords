-- Where a saved message came from.
CREATE TYPE "SavedMessageSourceType" AS ENUM ('CHANNEL', 'DIRECT');

-- A per-user bookmark with a snapshot of the message at save time. channelId, conversationId,
-- serverId and originalMessageId deliberately have no foreign key, so the bookmark survives the
-- source being deleted.
CREATE TABLE "SavedMessage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceType" "SavedMessageSourceType" NOT NULL,
    "channelId" TEXT,
    "conversationId" TEXT,
    "serverId" TEXT,
    "originalMessageId" TEXT NOT NULL,
    "snapshotContent" TEXT NOT NULL,
    "snapshotAuthorId" TEXT NOT NULL,
    "snapshotAuthorName" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedMessage_ownerId_sourceType_originalMessageId_key" ON "SavedMessage"("ownerId", "sourceType", "originalMessageId");
CREATE INDEX "SavedMessage_ownerId_createdAt_idx" ON "SavedMessage"("ownerId", "createdAt");
-- The reminder sweep's lookup: due and not yet delivered.
CREATE INDEX "SavedMessage_remindAt_remindedAt_idx" ON "SavedMessage"("remindAt", "remindedAt");

ALTER TABLE "SavedMessage" ADD CONSTRAINT "SavedMessage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
