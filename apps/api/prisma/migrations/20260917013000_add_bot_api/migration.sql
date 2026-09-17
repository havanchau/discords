-- A bot's own User row (kind BOT) and its server memberships (kind BOT). The new values are only
-- added here, never used: PostgreSQL refuses a value added in the same transaction until it commits,
-- so no default, backfill or row in this migration refers to 'BOT'.
ALTER TYPE "MemberKind" ADD VALUE 'BOT';

ALTER TYPE "UserKind" ADD VALUE 'BOT';

-- A bot account owned by a person. Only the SHA-256 of the token is stored; the token carries the
-- bot id, so the row is found by primary key and tokenHash needs no index. Deleting the bot keeps
-- its User row (botUserId), so messages it posted keep their author.
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bot_botUserId_key" ON "Bot"("botUserId");

CREATE INDEX "Bot_ownerId_idx" ON "Bot"("ownerId");

ALTER TABLE "Bot" ADD CONSTRAINT "Bot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bot" ADD CONSTRAINT "Bot_botUserId_fkey" FOREIGN KEY ("botUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
