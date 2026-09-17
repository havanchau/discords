/**
 * Every key that affects a result is part of the key, so a change of server or user refetches
 * instead of showing the previous one's data.
 */
export const queryKeys = {
  servers: (userId: string) => ['servers', userId] as const,
  serverDetail: (serverId: string) => ['server-detail', serverId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  serverEvents: (serverId: string) => ['server-events', serverId] as const,
  serverEmojis: (serverId: string) => ['server-emojis', serverId] as const,
  serverStickers: (serverId: string) => ['server-stickers', serverId] as const,
  serverSoundboard: (serverId: string) => ['server-soundboard', serverId] as const,
  sessions: (userId: string) => ['auth-sessions', userId] as const,
  accountExport: (userId: string) => ['account-export', userId] as const,
  userProfile: (userId: string, serverId: string | null) =>
    ['user-profile', userId, serverId] as const,
  /** Prefix for every server context of one user's profile, for invalidating them together. */
  userProfilesOf: (userId: string) => ['user-profile', userId] as const,
  serverBans: (serverId: string) => ['server-bans', serverId] as const,
  messageReports: (serverId: string, status: string) =>
    ['message-reports', serverId, status] as const,
  /** Prefix for every status tab of one server's queue, for invalidating them together. */
  messageReportsOf: (serverId: string) => ['message-reports', serverId] as const,
  auditLogs: (serverId: string) => ['audit-logs', serverId] as const,
  autoModRules: (serverId: string) => ['automod-rules', serverId] as const,
  serverOnboarding: (serverId: string) => ['server-onboarding', serverId] as const,
  serverTemplates: (userId: string) => ['server-templates', userId] as const,
  serverDiscovery: (serverId: string) => ['server-discovery', serverId] as const,
  discoveryServers: (query: string, tag: string | null) =>
    ['discovery-servers', query, tag ?? 'all'] as const,
  friends: (userId: string) => ['friends', userId] as const,
  directConversations: (userId: string) => ['direct-conversations', userId] as const,
  linkPreview: (url: string) => ['link-preview', url] as const,
  /** `revision` changes with the vote counts, so an open voter list refetches after each vote. */
  poll: (pollId: string, revision: string) => ['poll', pollId, revision] as const,
  serverInvites: (serverId: string) => ['server-invites', serverId] as const,
  channelOverrides: (channelId: string) => ['channel-overrides', channelId] as const,
  channelWebhooks: (channelId: string) => ['channel-webhooks', channelId] as const,
  ownedBots: (userId: string) => ['owned-bots', userId] as const,
  botAuthorization: (userId: string, botId: string) =>
    ['bot-authorization', userId, botId] as const,
  savedMessages: (userId: string) => ['saved-messages', userId] as const,
  scheduledMessages: (userId: string, destinationType: string, destinationId: string) =>
    ['scheduled-messages', userId, destinationType, destinationId] as const,
  /** Prefix for every destination's list of one user, for invalidating them together. */
  scheduledMessagesOf: (userId: string) => ['scheduled-messages', userId] as const,
  forumPosts: (channelId: string, tagId: string | null) =>
    ['forum-posts', channelId, tagId ?? 'all'] as const,
  /** Prefix for every tag filter of one forum channel, for invalidating them together. */
  forumPostsOf: (channelId: string) => ['forum-posts', channelId] as const,
  forumTags: (channelId: string) => ['forum-tags', channelId] as const,
  notificationPreferences: (userId: string) => ['notification-preferences', userId] as const,
} as const;
