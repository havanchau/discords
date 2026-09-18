-- Stage channels. PostgreSQL 12+ accepts ADD VALUE inside the migration's transaction as long as the
-- new value is not used before commit; nothing below references 'STAGE'.
ALTER TYPE "ChannelType" ADD VALUE 'STAGE';

-- A STAGE channel's current speaker roster, not call history.
CREATE TABLE "StageSpeaker" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageSpeaker_pkey" PRIMARY KEY ("channelId","userId")
);

-- Pending requests to speak from a STAGE channel's audience.
CREATE TABLE "StageSpeakRequest" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageSpeakRequest_pkey" PRIMARY KEY ("channelId","userId")
);

-- The kick/ban cleanup deletes by user across a server's stage channels.
CREATE INDEX "StageSpeaker_userId_idx" ON "StageSpeaker"("userId");

CREATE INDEX "StageSpeakRequest_userId_idx" ON "StageSpeakRequest"("userId");

ALTER TABLE "StageSpeaker" ADD CONSTRAINT "StageSpeaker_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageSpeaker" ADD CONSTRAINT "StageSpeaker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageSpeakRequest" ADD CONSTRAINT "StageSpeakRequest_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageSpeakRequest" ADD CONSTRAINT "StageSpeakRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
