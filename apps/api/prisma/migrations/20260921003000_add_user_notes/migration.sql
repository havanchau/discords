-- Private user notes: one row per (author, target) pair, readable only by the author.
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNote_authorId_targetId_key" ON "UserNote"("authorId", "targetId");

-- The account-deletion cleanup also deletes the notes written about the deleted user.
CREATE INDEX "UserNote_targetId_idx" ON "UserNote"("targetId");

ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
