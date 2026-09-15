-- Scheduled server events. Status (scheduled/active) is computed from startAt/endAt, not stored.
CREATE TABLE "ServerEvent" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerEvent_serverId_startAt_idx" ON "ServerEvent"("serverId", "startAt");

ALTER TABLE "ServerEvent" ADD CONSTRAINT "ServerEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerEvent" ADD CONSTRAINT "ServerEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServerEvent" ADD CONSTRAINT "ServerEvent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One row per member interested in an event.
CREATE TABLE "ServerEventInterest" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerEventInterest_pkey" PRIMARY KEY ("eventId","userId")
);

CREATE INDEX "ServerEventInterest_userId_idx" ON "ServerEventInterest"("userId");

ALTER TABLE "ServerEventInterest" ADD CONSTRAINT "ServerEventInterest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ServerEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerEventInterest" ADD CONSTRAINT "ServerEventInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
