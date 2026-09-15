-- Named, ordered groups of channels. Deleting a category leaves its channels uncategorized.
CREATE TABLE "ChannelCategory" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelCategory_serverId_position_idx" ON "ChannelCategory"("serverId", "position");

ALTER TABLE "ChannelCategory" ADD CONSTRAINT "ChannelCategory_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Channel" ADD COLUMN "categoryId" TEXT;

CREATE INDEX "Channel_categoryId_idx" ON "Channel"("categoryId");

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ChannelCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
