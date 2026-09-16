/**
 * Every key that affects a result is part of the key, so a change of server or user refetches
 * instead of showing the previous one's data.
 */
export const queryKeys = {
  notifications: (userId: string) => ['notifications', userId] as const,
  serverEvents: (serverId: string) => ['server-events', serverId] as const,
  serverEmojis: (serverId: string) => ['server-emojis', serverId] as const,
  sessions: (userId: string) => ['auth-sessions', userId] as const,
  userProfile: (userId: string, serverId: string | null) =>
    ['user-profile', userId, serverId] as const,
  /** Prefix for every server context of one user's profile, for invalidating them together. */
  userProfilesOf: (userId: string) => ['user-profile', userId] as const,
  serverBans: (serverId: string) => ['server-bans', serverId] as const,
  auditLogs: (serverId: string) => ['audit-logs', serverId] as const,
  friends: (userId: string) => ['friends', userId] as const,
  directConversations: (userId: string) => ['direct-conversations', userId] as const,
  linkPreview: (url: string) => ['link-preview', url] as const,
  serverInvites: (serverId: string) => ['server-invites', serverId] as const,
  channelOverrides: (channelId: string) => ['channel-overrides', channelId] as const,
  notificationPreferences: (userId: string) => ['notification-preferences', userId] as const,
} as const;
