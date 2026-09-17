-- What a User row stands for. Every existing row is a person, so the default backfills HUMAN; a
-- constant default on a NOT NULL column is a metadata-only change in PostgreSQL 11+, not a rewrite.
CREATE TYPE "UserKind" AS ENUM ('HUMAN', 'WEBHOOK');

ALTER TABLE "User" ADD COLUMN "kind" "UserKind" NOT NULL DEFAULT 'HUMAN';

-- The name and avatar a webhook post supplied; null on every other message.
ALTER TABLE "Message" ADD COLUMN "authorAvatarOverride" TEXT,
ADD COLUMN "authorNameOverride" TEXT;

-- An incoming webhook. Only the SHA-256 of the token is stored. The webhook's own User row
-- (webhookUserId) is not deleted with the webhook, so messages it posted keep their author.
CREATE TABLE "ServerWebhook" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "webhookUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServerWebhook_webhookUserId_key" ON "ServerWebhook"("webhookUserId");

CREATE INDEX "ServerWebhook_channelId_idx" ON "ServerWebhook"("channelId");

CREATE INDEX "ServerWebhook_serverId_idx" ON "ServerWebhook"("serverId");

-- Deleting the server or the channel removes its webhooks.
ALTER TABLE "ServerWebhook" ADD CONSTRAINT "ServerWebhook_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerWebhook" ADD CONSTRAINT "ServerWebhook_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerWebhook" ADD CONSTRAINT "ServerWebhook_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServerWebhook" ADD CONSTRAINT "ServerWebhook_webhookUserId_fkey" FOREIGN KEY ("webhookUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
