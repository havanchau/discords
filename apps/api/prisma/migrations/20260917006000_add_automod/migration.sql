-- What an AutoMod rule looks for, and what it does when a message matches.
CREATE TYPE "AutoModTriggerType" AS ENUM ('KEYWORD', 'REGEX', 'MENTION_SPAM', 'INVITE_LINK', 'EXTERNAL_LINK');
CREATE TYPE "AutoModAction" AS ENUM ('BLOCK_MESSAGE', 'ALERT_ONLY', 'TIMEOUT_AUTHOR');

-- A server's automatic content rule. createdById has no foreign key, so a rule outlives its creator;
-- alertChannelId is SET NULL on delete, so deleting the alert channel keeps the rule without alerts.
CREATE TABLE "AutoModRule" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" "AutoModTriggerType" NOT NULL,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pattern" TEXT,
    "mentionLimit" INTEGER,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action" "AutoModAction" NOT NULL,
    "alsoAllowMessage" BOOLEAN NOT NULL DEFAULT false,
    "timeoutMinutes" INTEGER,
    "alertChannelId" TEXT,
    "exemptRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exemptChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoModRule_pkey" PRIMARY KEY ("id")
);

-- The evaluator and the settings list both read one server's rules in position order.
CREATE INDEX "AutoModRule_serverId_position_idx" ON "AutoModRule"("serverId", "position");

ALTER TABLE "AutoModRule" ADD CONSTRAINT "AutoModRule_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoModRule" ADD CONSTRAINT "AutoModRule_alertChannelId_fkey" FOREIGN KEY ("alertChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
