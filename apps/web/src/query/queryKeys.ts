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
} as const;
