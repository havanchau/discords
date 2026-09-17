-- Server stickers and soundboard clips (docs/features/stickers-and-soundboard.md). Additive only: two
-- new tables, and one nullable column plus index on each attachment table, so existing rows are
-- untouched.
CREATE TABLE "ServerSticker" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerSticker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SoundboardClip" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundboardClip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServerSticker_serverId_name_key" ON "ServerSticker"("serverId", "name");

CREATE UNIQUE INDEX "SoundboardClip_serverId_name_key" ON "SoundboardClip"("serverId", "name");

ALTER TABLE "ServerSticker" ADD CONSTRAINT "ServerSticker_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerSticker" ADD CONSTRAINT "ServerSticker_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SoundboardClip" ADD CONSTRAINT "SoundboardClip_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SoundboardClip" ADD CONSTRAINT "SoundboardClip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sticker attachments reference their sticker. SET NULL on delete: the message stays, and the client
-- renders a "sticker deleted" placeholder. Nullable, so no default or backfill is needed.
ALTER TABLE "MessageAttachment" ADD COLUMN     "stickerId" TEXT;

CREATE INDEX "MessageAttachment_stickerId_idx" ON "MessageAttachment"("stickerId");

ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "ServerSticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Only forwarded sticker messages write this column.
ALTER TABLE "DirectMessageAttachment" ADD COLUMN     "stickerId" TEXT;

CREATE INDEX "DirectMessageAttachment_stickerId_idx" ON "DirectMessageAttachment"("stickerId");

ALTER TABLE "DirectMessageAttachment" ADD CONSTRAINT "DirectMessageAttachment_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "ServerSticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
