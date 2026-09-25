import { CustomStatus } from './api-contract.js';
import { UserStatus } from './types.js';

export const RealtimeEvents = {
  MessageCreate: 'message:create',
  MessageCreated: 'message:created',
  MessageUpdate: 'message:update',
  MessageUpdated: 'message:updated',
  MessageDelete: 'message:delete',
  MessageDeleted: 'message:deleted',
  ThreadJoin: 'thread:join',
  ThreadMessageCreate: 'thread:message:create',
  ThreadMessageCreated: 'thread:message:created',
  ThreadMessageUpdated: 'thread:message:updated',
  ThreadMessageDeleted: 'thread:message:deleted',
  ForumPostCreated: 'forum:post-created',
  ConversationJoin: 'conversation:join',
  DmCreated: 'dm:created',
  DmUnread: 'dm:unread',
  DmUpdated: 'dm:updated',
  DmDeleted: 'dm:deleted',
  DmReactionUpdated: 'dm:reaction-updated',
  DmConversationUpdated: 'dm:conversation-updated',
  DmConversationRemoved: 'dm:conversation-removed',
  DmCallRing: 'dm:call:ring',
  DmCallIncoming: 'dm:call:incoming',
  DmCallDecline: 'dm:call:decline',
  DmCallDeclined: 'dm:call:declined',
  DmCallCancel: 'dm:call:cancel',
  DmCallRingStopped: 'dm:call:ring-stopped',
  FriendRequest: 'friend:request',
  FriendUpdated: 'friend:updated',
  ServerMemberRemoved: 'server:member-removed',
  /** `{ serverId, fromUserId, toUserId }` after the owner hands the server to another member. */
  ServerOwnershipTransferred: 'server:ownership-transferred',
  /** `{ serverId }` to the server room and every former member; clients drop the server. */
  ServerDeleted: 'server:deleted',
  AccountDeleted: 'user:account-deleted',
  ServerMemberUpdated: 'server:member-updated',
  ServerEmojisUpdated: 'server:emojis-updated',
  ServerStickersUpdated: 'server:stickers-updated',
  ServerSoundboardUpdated: 'server:soundboard-updated',
  ServerEventsUpdated: 'server:events-updated',
  /** `{ serverId }` after rules screening settings change; clients refetch the server detail. */
  ServerOnboardingUpdated: 'server:onboarding-updated',
  PollUpdated: 'poll:updated',
  ScheduledMessageUpdated: 'scheduled-message:updated',
  NotificationCreated: 'notification:created',
  NotificationUnread: 'notification:unread',
  /** `{ serverId, channelId }` after a channel's settings change; clients refetch the server detail. */
  ChannelUpdated: 'channel:updated',
  ChannelJoin: 'channel:join',
  ChannelLeave: 'channel:leave',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  PresenceUpdate: 'presence:update',
  ReactionToggle: 'reaction:toggle',
  ReactionUpdated: 'reaction:updated',
  VoiceJoin: 'voice:join',
  VoiceLeave: 'voice:leave',
  VoiceState: 'voice:state',
  VoiceUserJoined: 'voice:user-joined',
  VoiceUserUpdated: 'voice:user-updated',
  VoiceUserLeft: 'voice:user-left',
  VoiceActive: 'voice:active',
  VoiceEnded: 'voice:ended',
  SoundboardPlay: 'soundboard:play',
  SoundboardPlayed: 'soundboard:played',
  WebRtcOffer: 'webrtc:offer',
  WebRtcAnswer: 'webrtc:answer',
  WebRtcIceCandidate: 'webrtc:ice-candidate',
  /** Delivered only to the owning bot's gateway socket; see `bot-gateway-and-slash-commands.md`. */
  InteractionCreate: 'interaction:create',
  /** Delivered to the invoker when their slash command interaction times out unanswered. */
  InteractionTimeout: 'interaction:timeout',
  /** `{ channelId, userId, role }` to the stage's call and channel rooms when its speakers change. */
  StageRoleChanged: 'stage:role-changed',
  /** `{ channelId, userId, requested }` to the same two rooms, for the moderator's speak queue. */
  StageSpeakRequestUpdated: 'stage:speak-request-updated',
} as const;

export type RealtimeEvent = (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

/**
 * Partial by design: a connect/disconnect carries `status`, a profile save carries `customStatus`.
 */
export interface PresenceUpdatePayload {
  userId: string;
  status?: UserStatus;
  customStatus?: CustomStatus | null;
}

/** Sent to every server the account belonged to once it is anonymized, so rosters drop the member. */
export interface AccountDeletedPayload {
  userId: string;
}

export type StageRole = 'audience' | 'speaker';

/** `stage:role-changed` — a `STAGE` channel's speaker set changed. */
export interface StageRoleChangedPayload {
  channelId: string;
  userId: string;
  role: StageRole;
}

/** `stage:speak-request-updated` — an audience member requested (or withdrew a request) to speak. */
export interface StageSpeakRequestUpdatedPayload {
  channelId: string;
  userId: string;
  requested: boolean;
}
