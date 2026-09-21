-- Message edit history: the content each edit replaced. New table only; no lock on "Message".
-- down(): DROP TABLE "MessageRevision";
CREATE TABLE "MessageRevision" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

-- The only read: every revision of one message, oldest first.
CREATE INDEX "MessageRevision_messageId_createdAt_idx" ON "MessageRevision"("messageId", "createdAt");

ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
