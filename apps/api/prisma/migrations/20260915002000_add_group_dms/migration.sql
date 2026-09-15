-- Group direct conversations. Existing rows stay 1-1 conversations (isGroup = false).
ALTER TABLE "DirectConversation" ADD COLUMN "isGroup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "name" TEXT,
ADD COLUMN "ownerId" TEXT;

ALTER TABLE "DirectConversationMember" ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
