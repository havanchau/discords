/**
 * The HTTP API contract, shared by the server that produces these shapes and the client that reads
 * them. A response type belongs here so a field can only change in one place: the API annotates its
 * responses with these types, and the web client imports them instead of restating them.
 *
 * Dates are ISO 8601 strings, as they are on the wire.
 */
import { ChannelType, UserStatus } from './types.js';

export interface CustomStatus {
  text: string | null;
  emoji: string | null;
  /** Already formatted as an ISO timestamp by the server; null means no expiry. */
  expiresAt: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  customStatus?: CustomStatus | null;
  locale?: string | null;
  status?: UserStatus;
  createdAt?: Date;
  emailVerifiedAt?: Date | null;
}

/** A member's identity inside one server, plus the roles that decorate it on the profile card. */
export interface UserProfileServerContext {
  serverId: string;
  nickname: string | null;
  avatarUrl: string | null;
  joinedAt: Date;
  roles: Array<{ id: string; name: string; color?: string | null }>;
}

export interface UserProfile extends PublicUser {
  createdAt: Date;
  server: UserProfileServerContext | null;
}

/** Another user's profile as returned by friends and DM endpoints; email is private to its owner. */
export type PublicUser = Omit<User, 'email' | 'emailVerifiedAt'>;

export interface ServerSummary {
  id: string;
  name: string;
  description?: string | null;
  channels: Channel[];
}

export interface ServerMemberDetail {
  id: string;
  /** Other members' email is deliberately not sent, so this is the public projection. */
  user: PublicUser;
  kind: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  timeoutUntil?: Date | null;
  roles?: Array<{ role: Role }>;
}

export interface ChannelCategory {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

export interface ServerDetail extends ServerSummary {
  members: ServerMemberDetail[];
  roles: Role[];
  categories?: ChannelCategory[];
}

export interface AuthSessionEntry {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  current: boolean;
}

export interface LinkPreview {
  url: string;
  hostname: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
}

export interface ServerEventView {
  id: string;
  serverId: string;
  channelId: string | null;
  name: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  creator: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
  interestedCount: number;
  interested: boolean;
}

export interface CreateServerEventInput {
  name: string;
  description?: string;
  location?: string;
  channelId?: string;
  startAt: string;
  endAt?: string;
}

export interface ServerEmoji {
  id: string;
  name: string;
  url: string;
  creatorId: string;
  createdAt: Date;
}

export interface ServerBanEntry {
  id: string;
  reason?: string | null;
  createdAt: Date;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  bannedBy: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export interface Role {
  id: string;
  name: string;
  color?: string | null;
  permissions: string[];
}

export interface Channel {
  id: string;
  serverId: string;
  categoryId?: string | null;
  name: string;
  type: ChannelType;
  topic?: string | null;
  avatarUrl?: string | null;
  position?: number;
  isPrivate?: boolean;
  slowmodeSeconds?: number;
  unreadCount?: number;
}

export interface ChannelPermissionOverride {
  id: string;
  channelId: string;
  roleId?: string | null;
  memberId?: string | null;
  allow: string[];
  deny: string[];
}

export interface NotificationPreference {
  id: string;
  serverId?: string | null;
  channelId?: string | null;
  muted: boolean;
  mentionOnly: boolean;
  desktopEnabled: boolean;
}

export interface Invite {
  id: string;
  code: string;
  serverId: string;
  channelId?: string | null;
  creatorId: string;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
}

export interface AuditLogEntry {
  id: string;
  serverId: string;
  actorId: string;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  actor?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export interface Message {
  id: string;
  channelId: string;
  serverId: string;
  authorId: string;
  content: string;
  /** Added by the web client while decrypting an E2EE channel; the API never sends these. */
  isEncrypted?: boolean;
  encryptedContent?: string;
  decryptionFailed?: boolean;
  createdAt: Date;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyToMessageId?: string | null;
  replyToMessage?: Message | null;
  threadId?: string | null;
  thread?: ThreadSummary | null;
}

export interface ThreadSummary {
  id: string;
  rootMessageId: string;
  channelId: string;
  replyCount: number;
  lastReplyAt: Date;
  participants: Array<{
    user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
    lastReadAt?: Date | null;
  }>;
}

export interface ThreadMessageResult {
  rootMessage: Message;
  thread: ThreadSummary | null;
  message?: Message;
  messages?: Message[];
}

export interface MessageAttachment {
  id?: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface FriendEntry {
  id: string;
  user: PublicUser;
  status: 'ACCEPTED';
}

export interface FriendRequestEntry {
  id: string;
  requesterId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
  requester?: PublicUser;
  receiver?: PublicUser;
}

export interface BlockedUserEntry {
  user: PublicUser;
  createdAt: Date;
}

export interface FriendsSummary {
  friends: FriendEntry[];
  pendingIncoming: FriendRequestEntry[];
  pendingOutgoing: FriendRequestEntry[];
  blocked: BlockedUserEntry[];
}

export interface DirectConversation {
  id: string;
  isGroup?: boolean;
  name?: string | null;
  ownerId?: string | null;
  members: Array<{ user: PublicUser }>;
  messages: DirectMessage[];
  updatedAt?: Date;
  unreadCount?: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  actorId?: string | null;
  actor?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
  channelId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}

export interface DirectMessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface DirectMessageReplyPreview {
  id: string;
  authorId: string;
  author?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  content: string;
  deletedAt?: Date | null;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  authorId: string;
  author?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  content: string;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  replyToMessageId?: string | null;
  replyToMessage?: DirectMessageReplyPreview | null;
  pinnedAt?: Date | null;
  pinnedById?: string | null;
  reactions?: DirectMessageReaction[];
}
