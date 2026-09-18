export interface RequestUser {
  id: string;
  email: string;
  username: string;
  sessionId: string;
  locale: string | null;
  /** Never used for authorization outside `PlatformAdminGuard`; every other route ignores it. */
  platformRole: 'USER' | 'ADMIN';
}
