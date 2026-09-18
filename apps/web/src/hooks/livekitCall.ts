import {
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import type { VoiceLivekitAccess } from '@discord-clone/shared';
import type { CallMode } from '@/helpers';

export interface LivekitCallHandlers {
  /** A remote participant's subscribed tracks changed; `undefined` once none are left. */
  onRemoteStream: (socketId: string, stream: MediaStream | undefined) => void;
  /** LiveKit gave up on the connection (server restart it could not resume, removal). */
  onDisconnected: (room: Room) => void;
  /** The server changed this client's publish right (stage promote or demote). */
  onCanPublishChanged: (canPublish: boolean) => void;
}

/**
 * The API names a LiveKit participant `${userId}:${socketId}` (`voice-sfu.md` → Changes §4); the
 * socket id is what the call roster (`voice:user-*` events) keys participants by.
 */
export function socketIdFromIdentity(identity: string) {
  const separator = identity.indexOf(':');
  return separator === -1 ? identity : identity.slice(separator + 1);
}

/** Connects to the call's LiveKit room; ICE and TURN come from the server, not from the client. */
export async function connectLivekitCall(
  access: VoiceLivekitAccess,
  handlers: LivekitCallHandlers,
) {
  const room = new Room({ adaptiveStream: true, dynacast: true });

  const syncRemote = (participant: RemoteParticipant) => {
    const tracks = [...participant.trackPublications.values()]
      .map((publication) => publication.track?.mediaStreamTrack)
      .filter((track): track is MediaStreamTrack => Boolean(track));
    handlers.onRemoteStream(
      socketIdFromIdentity(participant.identity),
      tracks.length ? new MediaStream(tracks) : undefined,
    );
  };

  room
    .on(RoomEvent.TrackSubscribed, (_track, _publication, participant) => syncRemote(participant))
    .on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => syncRemote(participant))
    .on(RoomEvent.Disconnected, () => handlers.onDisconnected(room))
    .on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant: Participant) => {
      if (participant.identity !== room.localParticipant.identity) return;
      handlers.onCanPublishChanged(Boolean(participant.permissions?.canPublish));
    });

  await room.connect(access.url, access.token);
  return room;
}

export function canPublish(room: Room) {
  return Boolean(room.localParticipant.permissions?.canPublish);
}

/** Publishes every captured track once; LiveKit forwards it to each subscriber. */
export async function publishStream(room: Room, stream: MediaStream, mode: CallMode) {
  const isScreen = mode === 'screen';
  for (const track of stream.getTracks()) {
    const source =
      track.kind === 'audio'
        ? isScreen
          ? Track.Source.ScreenShareAudio
          : Track.Source.Microphone
        : isScreen
          ? Track.Source.ScreenShare
          : Track.Source.Camera;
    await room.localParticipant.publishTrack(track, { source });
  }
}

export async function unpublishAll(room: Room) {
  const tracks = localTracks(room);
  if (tracks.length) await room.localParticipant.unpublishTracks(tracks);
}

/** Mutes through LiveKit so subscribers see the track as muted, not as silence. */
export async function setLocalMuted(room: Room, kind: 'audio' | 'video', muted: boolean) {
  const trackKind = kind === 'audio' ? Track.Kind.Audio : Track.Kind.Video;
  for (const track of localTracks(room)) {
    if (track.kind !== trackKind) continue;
    await (muted ? track.mute() : track.unmute());
  }
}

function localTracks(room: Room): LocalTrack[] {
  return [...room.localParticipant.trackPublications.values()]
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => Boolean(track));
}
