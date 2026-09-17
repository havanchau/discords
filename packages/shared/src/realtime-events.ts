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
  AccountDeleted: 'user:account-deleted',
  ServerMemberUpdated: 'server:member-updated',
  ServerEmojisUpdated: 'server:emojis-updated',
  ServerStickersUpdated: 'server:stickers-updated',
  ServerSoundboardUpdated: 'server:soundboard-updated',
  ServerEventsUpdated: 'server:events-updated',
  PollUpdated: 'poll:updated',
  ScheduledMessageUpdated: 'scheduled-message:updated',
  NotificationCreated: 'notification:created',
  NotificationUnread: 'notification:unread',
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
