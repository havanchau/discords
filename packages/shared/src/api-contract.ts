/**
 * The HTTP API contract, shared by the server that produces these shapes and the client that reads
 * them. A response type belongs here so a field can only change in one place: the API annotates its
 * responses with these types, and the web client imports them instead of restating them.
 *
 * Dates are ISO 8601 strings, as they are on the wire.
 */
import { ChannelType, UserStatus } from './types.js';
import type { MessageStickerRef } from './stickers-soundboard.js';
import type { UserKind } from './webhooks.js';

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
  /** True while rules screening blocks the viewer: screening is on and they have not accepted. */
  needsOnboarding: boolean;
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
  /** Set only on a FORUM channel. */
  postGuidelines?: string | null;
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
  /**
   * For a webhook post, `displayName` and `avatarUrl` are already the name and avatar that post
   * supplied, and `kind` is WEBHOOK. Absent `kind` means HUMAN.
   */
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> & { kind?: UserKind };
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyToMessageId?: string | null;
  replyToMessage?: Message | null;
  threadId?: string | null;
  thread?: ThreadSummary | null;
  /** Null for ordinary messages and for deleted poll messages. */
  poll?: PollView | null;
  /** Set only on a forwarded copy. */
  forwardOrigin?: ForwardOrigin | null;
}

export type ForwardSourceType = 'CHANNEL' | 'DIRECT';

/**
 * What a forwarded message was copied from, snapshotted at forward time so the label survives the
 * source being edited, deleted, or becoming unreadable. A poll is snapshotted as its question text.
 */
export interface ForwardOrigin {
  sourceType: ForwardSourceType;
  authorName: string;
  content: string;
  /** The source channel's name; null when the source was a direct message. */
  channelName: string | null;
}

/** Body of `POST /messages/:id/forward` and `POST /direct-messages/:id/forward`. */
export interface ForwardMessageInput {
  destinationType: 'channel' | 'conversation';
  destinationId: string;
  comment?: string;
}

export type PollStatus = 'OPEN' | 'CLOSED';

export interface PollOptionView {
  id: string;
  label: string;
  voteCount: number;
  /** Present only when the poll was created with `showVoters`. */
  voters?: Array<Pick<User, 'id' | 'displayName' | 'avatarUrl'>>;
}

export interface PollView {
  id: string;
  question: string;
  allowMultiple: boolean;
  showVoters: boolean;
  expiresAt: Date | null;
  closedAt: Date | null;
  status: PollStatus;
  options: PollOptionView[];
  /**
   * The requesting user's current selection. Realtime payloads go to many users, so there it is
   * always empty and clients keep the value they already hold.
   */
  votedOptionIds: string[];
}

export interface CreatePollInput {
  question: string;
  options: string[];
  allowMultiple?: boolean;
  showVoters?: boolean;
  expiresAt?: string;
}

/** `poll:updated`: aggregate counts only, never who voted. */
export interface PollUpdatedPayload {
  pollId: string;
  channelId: string | null;
  conversationId: string | null;
  status: PollStatus;
  closedAt: Date | null;
  options: Array<Pick<PollOptionView, 'id' | 'voteCount'>>;
}

export interface ThreadSummary {
  id: string;
  rootMessageId: string;
  channelId: string;
  /** Set only on a forum post. */
  title?: string | null;
  /** A forum post's tags, in the channel's tag order; empty on any other thread. */
  tags?: ForumTagView[];
  replyCount: number;
  lastReplyAt: Date;
  participants: Array<{
    user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
    lastReadAt?: Date | null;
  }>;
}

export const FORUM_POST_TITLE_MAX_LENGTH = 100;
export const FORUM_POST_MAX_TAGS = 5;
export const FORUM_MAX_TAGS = 20;
export const FORUM_TAG_NAME_MAX_LENGTH = 30;
export const FORUM_POST_GUIDELINES_MAX_LENGTH = 2000;

export interface ForumTagView {
  id: string;
  name: string;
}

/** A forum post is a titled thread; `rootMessage.thread` is the same summary as `thread`. */
export interface ForumPostView {
  thread: ThreadSummary;
  rootMessage: Message;
}

export interface ForumPostListResult {
  posts: ForumPostView[];
  nextCursor: string | null;
}

export interface CreateForumPostInput {
  title: string;
  tagIds?: string[];
  content: string;
  attachments?: MessageAttachment[];
}

/** The full tag set: an entry with an `id` renames that tag, one without creates it, a missing id deletes it. */
export interface UpdateForumTagsInput {
  tags: Array<{ id?: string; name: string }>;
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
  /** 'voice' for a recorded voice message, 'sticker' for a server sticker; null for any other file. */
  kind?: 'voice' | 'sticker' | null;
  durationMs?: number | null;
  waveform?: number[] | null;
  /** Set only on a sticker attachment: the sticker, or null once it was deleted (render a placeholder). */
  sticker?: MessageStickerRef | null;
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
  /** Absent only on the conversation-list preview, which does not load attachments. */
  attachments?: MessageAttachment[];
  poll?: PollView | null;
  /** Set only on a forwarded copy. */
  forwardOrigin?: ForwardOrigin | null;
}

export type SavedMessageSourceType = 'CHANNEL' | 'DIRECT';

/** A user's bookmark: a snapshot taken at save time, not the live message. */
export interface SavedMessageView {
  id: string;
  sourceType: SavedMessageSourceType;
  snapshotContent: string;
  /** `displayName` is the author's name at save time; `avatarUrl` is the author's current avatar. */
  snapshotAuthor: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
  channelId: string | null;
  conversationId: string | null;
  serverId: string | null;
  originalMessageId: string;
  /** Source labels, filled only while `isAccessible`, so a lost channel's name is not re-read. */
  channelName: string | null;
  serverName: string | null;
  remindAt: Date | null;
  remindedAt: Date | null;
  /** Recomputed on every read: the caller can still read the source and the message still exists. */
  isAccessible: boolean;
  createdAt: Date;
}

export interface CreateSavedMessageInput {
  sourceType: SavedMessageSourceType;
  messageId: string;
  remindAt?: string;
}

/** `SENDING` and `SENT` rows are never listed; a cancelled scheduled message is deleted. */
export type ScheduledMessageStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';

/** Why a scheduled send was refused at send time; the client translates the code. */
export type ScheduledMessageFailureReason =
  | 'NO_ACCESS'
  | 'MISSING_PERMISSION'
  | 'TIMED_OUT'
  | 'SLOWMODE'
  | 'BLOCKED'
  | 'REPLY_TARGET_MISSING'
  | 'REJECTED'
  | 'INTERRUPTED'
  | 'AUTOMOD_BLOCKED'
  | 'ACCOUNT_DELETION'
  | 'RULES_NOT_ACCEPTED'
  | 'UNKNOWN';

/** One of the caller's own scheduled messages; exactly one of `channelId`/`conversationId` is set. */
export interface ScheduledMessageView {
  id: string;
  channelId: string | null;
  conversationId: string | null;
  content: string;
  attachments: MessageAttachment[];
  replyToMessageId: string | null;
  sendAt: Date;
  status: ScheduledMessageStatus;
  failureReason: ScheduledMessageFailureReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScheduledMessageInput {
  content: string;
  attachments?: MessageAttachment[];
  replyToMessageId?: string;
  /** ISO 8601 instant, 1 minute to 30 days ahead. */
  sendAt: string;
}

export interface UpdateScheduledMessageInput {
  content?: string;
  attachments?: MessageAttachment[];
  sendAt?: string;
}

/** Sent to the author when a scheduled message was posted or failed. */
export interface ScheduledMessageUpdatedPayload {
  scheduledMessageId: string;
  channelId: string | null;
  conversationId: string | null;
  status: ScheduledMessageStatus;
}

export const messageReportReasons = ['SPAM', 'HARASSMENT', 'NSFW', 'HATE_SPEECH', 'OTHER'] as const;
export type MessageReportReason = (typeof messageReportReasons)[number];

export const messageReportStatuses = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type MessageReportStatus = (typeof messageReportStatuses)[number];

export type MessageReportTargetType = 'MESSAGE' | 'USER';

/** One report in a server's moderator queue, or the reporter's own report after filing it. */
export interface MessageReportView {
  id: string;
  targetType: MessageReportTargetType;
  reason: MessageReportReason;
  details: string | null;
  status: MessageReportStatus;
  createdAt: Date;
  reporter: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
  /** Null once the message is deleted, so the queue shows it as no longer available. */
  message: { id: string; content: string; channelId: string; authorId: string } | null;
  targetUser: Pick<User, 'id' | 'displayName'> | null;
  resolvedBy: Pick<User, 'id' | 'displayName'> | null;
  resolvedAt: Date | null;
}

export interface CreateMessageReportInput {
  targetType: MessageReportTargetType;
  /** Required for MESSAGE reports; optional context for USER reports. */
  messageId?: string;
  /** Required for USER reports. */
  targetUserId?: string;
  reason: MessageReportReason;
  details?: string;
}

export interface CreateMessageReportResult {
  report: MessageReportView;
  /** False when the reporter already had an open report on the same target. */
  created: boolean;
}

export interface UpdateMessageReportInput {
  status: Exclude<MessageReportStatus, 'OPEN'>;
}

export const autoModTriggerTypes = [
  'KEYWORD',
  'REGEX',
  'MENTION_SPAM',
  'INVITE_LINK',
  'EXTERNAL_LINK',
] as const;
export type AutoModTriggerType = (typeof autoModTriggerTypes)[number];

export const autoModActions = ['BLOCK_MESSAGE', 'ALERT_ONLY', 'TIMEOUT_AUTHOR'] as const;
export type AutoModAction = (typeof autoModActions)[number];

/** Same list as a manual timeout, without 0 (clear). */
export const autoModTimeoutMinutes = [1, 5, 10, 60, 1440, 10080] as const;

export const AUTOMOD_MAX_ENABLED_RULES = 20;
export const AUTOMOD_MAX_RULES = 50;
export const AUTOMOD_MAX_TERMS = 100;
export const AUTOMOD_MAX_TERM_LENGTH = 100;
export const AUTOMOD_MAX_PATTERN_LENGTH = 200;
export const AUTOMOD_MAX_ALLOWED_DOMAINS = 100;
export const AUTOMOD_MAX_MENTION_LIMIT = 50;

/** One AutoMod rule as server settings read it; fields that do not apply to the trigger are empty. */
export interface AutoModRuleView {
  id: string;
  serverId: string;
  name: string;
  triggerType: AutoModTriggerType;
  terms: string[];
  pattern: string | null;
  mentionLimit: number | null;
  allowedDomains: string[];
  action: AutoModAction;
  alsoAllowMessage: boolean;
  timeoutMinutes: number | null;
  alertChannelId: string | null;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  position: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAutoModRuleInput {
  name: string;
  triggerType: AutoModTriggerType;
  terms?: string[];
  pattern?: string;
  mentionLimit?: number;
  allowedDomains?: string[];
  action: AutoModAction;
  alsoAllowMessage?: boolean;
  timeoutMinutes?: number;
  alertChannelId?: string | null;
  exemptRoleIds?: string[];
  exemptChannelIds?: string[];
}

export type UpdateAutoModRuleInput = Partial<CreateAutoModRuleInput> & { enabled?: boolean };

/** `POST /users/me/delete`: every session is revoked; the account is anonymized at `scheduledAt`. */
export interface AccountDeletionScheduledResult {
  ok: true;
  scheduledAt: Date;
}

export type ExportJobStatus = 'PENDING' | 'READY' | 'FAILED';

/**
 * One of the caller's own data exports. `downloadUrl` is an API path that needs the caller's bearer
 * token; it is null unless the job is `READY` and `expiresAt` has not passed.
 */
export interface ExportJobView {
  id: string;
  status: ExportJobStatus;
  downloadUrl: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

export const ONBOARDING_RULES_MAX_LENGTH = 4000;
export const ONBOARDING_MAX_QUESTIONS = 5;
export const ONBOARDING_MAX_ROLES_PER_QUESTION = 10;
export const ONBOARDING_PROMPT_MAX_LENGTH = 200;

/**
 * The only permissions a self-assignable role may carry. A role granting anything else (a manage,
 * kick or ban permission) is never offered, so onboarding cannot hand out moderation rights.
 */
export const SELF_ASSIGNABLE_ROLE_PERMISSIONS = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'CREATE_INVITE',
  'CONNECT_VOICE',
  'SPEAK_VOICE',
  'UPLOAD_FILES',
] as const;

/** One self-assign question: the member picks one (`multiSelect: false`) or several of `roleIds`. */
export interface SelfAssignQuestion {
  id: string;
  prompt: string;
  roleIds: string[];
  multiSelect: boolean;
}

/**
 * `GET /servers/:serverId/onboarding`. Questions list only roles that still exist and are still
 * self-assignable; a question left with no roles is omitted.
 */
export interface ServerOnboardingView {
  enabled: boolean;
  rulesText: string | null;
  selfAssignQuestions: SelfAssignQuestion[];
  accepted: boolean;
}

/** `PATCH /servers/:serverId/onboarding`; a question without an `id` gets a new one. */
export interface UpdateServerOnboardingInput {
  enabled: boolean;
  rulesText?: string;
  selfAssignQuestions?: Array<Omit<SelfAssignQuestion, 'id'> & { id?: string }>;
}

/** `POST /servers/:serverId/onboarding/accept`. */
export interface AcceptServerOnboardingInput {
  rulesAccepted: true;
  roleIds?: string[];
}

export interface AcceptServerOnboardingResult {
  ok: true;
  grantedRoleIds: string[];
}
