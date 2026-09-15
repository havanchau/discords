-- Directional user blocks. Enforcement checks both directions.
CREATE TABLE "UserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy blocks were friend requests with status BLOCKED and no recorded blocker. The only UI path
-- that created them was the receiver's "Block" button, so the receiver is treated as the blocker.
INSERT INTO "UserBlock" ("blockerId", "blockedId", "createdAt")
SELECT "receiverId", "requesterId", "updatedAt" FROM "FriendRequest" WHERE "status" = 'BLOCKED'
ON CONFLICT DO NOTHING;

DELETE FROM "FriendRequest" WHERE "status" = 'BLOCKED';
