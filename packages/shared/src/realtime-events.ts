export const RealtimeEvents = {
  MessageCreate: 'message:create',
  MessageCreated: 'message:created',
  MessageUpdate: 'message:update',
  MessageUpdated: 'message:updated',
  MessageDelete: 'message:delete',
  MessageDeleted: 'message:deleted',
  ChannelJoin: 'channel:join',
  ChannelLeave: 'channel:leave',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  PresenceUpdate: 'presence:update',
  VoiceJoin: 'voice:join',
  VoiceLeave: 'voice:leave',
  WebRtcOffer: 'webrtc:offer',
  WebRtcAnswer: 'webrtc:answer',
  WebRtcIceCandidate: 'webrtc:ice-candidate'
} as const;

export type RealtimeEvent = (typeof RealtimeEvents)[keyof typeof RealtimeEvents];
