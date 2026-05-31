-- Channel-level permission overrides, read states, notification preferences, and audit logs.
CREATE TABLE "ChannelPermissionOverride" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "roleId" TEXT,
  "memberId" TEXT,
  "allow" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deny" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelPermissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReadState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "lastReadMessageId" TEXT,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReadState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "serverId" TEXT,
  "channelId" TEXT,
  "muted" BOOLEAN NOT NULL DEFAULT false,
  "mentionOnly" BOOLEAN NOT NULL DEFAULT false,
  "desktopEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelPermissionOverride_channelId_idx" ON "ChannelPermissionOverride"("channelId");
CREATE INDEX "ChannelPermissionOverride_roleId_idx" ON "ChannelPermissionOverride"("roleId");
CREATE INDEX "ChannelPermissionOverride_memberId_idx" ON "ChannelPermissionOverride"("memberId");
CREATE UNIQUE INDEX "ReadState_userId_channelId_key" ON "ReadState"("userId", "channelId");
CREATE INDEX "ReadState_channelId_lastReadAt_idx" ON "ReadState"("channelId", "lastReadAt");
CREATE INDEX "NotificationPreference_userId_serverId_idx" ON "NotificationPreference"("userId", "serverId");
CREATE INDEX "NotificationPreference_userId_channelId_idx" ON "NotificationPreference"("userId", "channelId");
CREATE INDEX "AuditLog_serverId_createdAt_idx" ON "AuditLog"("serverId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

ALTER TABLE "ChannelPermissionOverride" ADD CONSTRAINT "ChannelPermissionOverride_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPermissionOverride" ADD CONSTRAINT "ChannelPermissionOverride_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPermissionOverride" ADD CONSTRAINT "ChannelPermissionOverride_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ServerMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
