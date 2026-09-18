import type { StageRole } from './realtime-events.js';

/**
 * Which media path a call uses, chosen per API deployment by `VOICE_TRANSPORT` (`voice-sfu.md`).
 * `mesh` is the original peer-to-peer relay; `livekit` connects every participant to the SFU.
 */
export type VoiceTransport = 'mesh' | 'livekit';

/** LiveKit connection details for one participant: the public WS endpoint and a join token. */
export interface VoiceLivekitAccess {
  url: string;
  token: string;
}

/** Fields `voice:join` adds to its `{ participants }` ack. Mesh joins never carry `livekit`. */
export interface VoiceJoinTransportInfo {
  transport: VoiceTransport;
  livekit?: VoiceLivekitAccess;
  /** Set only when the call is a `STAGE` channel. */
  stageRole?: StageRole;
}

/** A speaker or a pending requester on a `STAGE` channel. */
export interface StageMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  /** When the user became a speaker, or when they requested to speak. */
  since: string;
}

/** `GET /channels/:channelId/stage`. `canModerate` tells the client whether to show moderator controls. */
export interface StageRosterView {
  speakers: StageMember[];
  requests: StageMember[];
  canModerate: boolean;
}
