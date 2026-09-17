-- Forward snapshot on channel messages. forwardedFrom* are plain ids with no foreign key, so a
-- forwarded copy survives the source message being deleted. forwardOriginLabel is the source
-- channel name, or NULL when the source was a direct message.
ALTER TABLE "Message" ADD COLUMN     "forwardOriginAuthorName" TEXT,
ADD COLUMN     "forwardOriginContent" TEXT,
ADD COLUMN     "forwardOriginLabel" TEXT,
ADD COLUMN     "forwardedFromDirectMessageId" TEXT,
ADD COLUMN     "forwardedFromMessageId" TEXT;

-- The same snapshot on direct messages.
ALTER TABLE "DirectMessage" ADD COLUMN     "forwardOriginAuthorName" TEXT,
ADD COLUMN     "forwardOriginContent" TEXT,
ADD COLUMN     "forwardOriginLabel" TEXT,
ADD COLUMN     "forwardedFromDirectMessageId" TEXT,
ADD COLUMN     "forwardedFromMessageId" TEXT;

-- Files attached to a direct message, by URL into existing upload storage (no bytes are copied).
CREATE TABLE "DirectMessageAttachment" (
    "id" TEXT NOT NULL,
    "directMessageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectMessageAttachment_directMessageId_idx" ON "DirectMessageAttachment"("directMessageId");

ALTER TABLE "DirectMessageAttachment" ADD CONSTRAINT "DirectMessageAttachment_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
