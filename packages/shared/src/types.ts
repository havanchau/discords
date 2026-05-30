export type UserStatus = 'ONLINE' | 'OFFLINE' | 'IDLE' | 'DND' | 'INVISIBLE';
export type ChannelType = 'TEXT' | 'VOICE';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
}

export interface ApiErrorResponse {
  message: string;
  statusCode: number;
  error?: string;
}
