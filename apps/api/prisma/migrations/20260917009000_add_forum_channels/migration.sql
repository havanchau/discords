-- Forum channels. PostgreSQL 12+ accepts ADD VALUE inside the migration's transaction as long as the
-- new value is not used before commit; nothing below references 'FORUM'.
ALTER TYPE "ChannelType" ADD VALUE 'FORUM';

-- Nullable, so neither ALTER rewrites its table. A thread started from a reply keeps a null title.
ALTER TABLE "Channel" ADD COLUMN "postGuidelines" TEXT;

ALTER TABLE "Thread" ADD COLUMN "title" TEXT;

-- A forum channel's tag set; deleting the channel deletes its tags.
CREATE TABLE "ForumTag" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumTag_pkey" PRIMARY KEY ("id")
);

-- Tags applied to a forum post; removing a tag from the channel removes it from every post.
CREATE TABLE "ThreadTag" (
    "threadId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ThreadTag_pkey" PRIMARY KEY ("threadId","tagId")
);

CREATE INDEX "ForumTag_channelId_position_idx" ON "ForumTag"("channelId", "position");

CREATE UNIQUE INDEX "ForumTag_channelId_name_key" ON "ForumTag"("channelId", "name");

CREATE INDEX "ThreadTag_tagId_idx" ON "ThreadTag"("tagId");

ALTER TABLE "ForumTag" ADD CONSTRAINT "ForumTag_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadTag" ADD CONSTRAINT "ThreadTag_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadTag" ADD CONSTRAINT "ThreadTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ForumTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
