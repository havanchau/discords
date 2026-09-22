export type UserStatus = 'ONLINE' | 'OFFLINE' | 'IDLE' | 'DND' | 'INVISIBLE';
export type ChannelType = 'TEXT' | 'VOICE' | 'FORUM' | 'STAGE' | 'ANNOUNCEMENT';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';

export interface ApiErrorResponse {
  message: string;
  statusCode: number;
  error?: string;
}
