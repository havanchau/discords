import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { Socket } from 'socket.io-client';
import type { VoiceJoinTransportInfo } from '@discord-clone/shared';
import { AuthState, Channel } from '@/api';
import { CallMode, CallParticipant, CallState, RemoteMedia } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import type * as LivekitCall from './livekitCall';

/** `livekit-client` is loaded only when the server picks the LiveKit transport. */
interface LivekitSession {
  room: Room;
  api: typeof LivekitCall;
}

interface UseChannelCallOptions {
  auth: AuthState | null;
  channel: Channel | null;
  socket: Socket | null;
  setWorkspaceError: (message: string | null) => void;
}

export interface StartCallOptions {
  receiveOnly?: boolean;
  /** Defaults to the selected channel; DM calls pass `dm:<conversationId>`. */
  callId?: string;
  label?: string;
}

export function useChannelCall({
  auth,
  channel,
  socket,
  setWorkspaceError,
}: UseChannelCallOptions) {
  const t = useTranslation();
  const [callState, setCallState] = useState<CallState | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  /** Set while the call runs over LiveKit; the mesh path leaves it null (`voice-sfu.md`). */
  const roomRef = useRef<LivekitSession | null>(null);
  const callStateRef = useRef<CallState | null>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState]);

  // Listeners attach once per socket; the helpers they call only use refs, state setters and the socket.
  const attachCallListeners = useEffectEvent(() => {
    if (!socket) return;

    const handleUserJoined = (payload: { channelId: string; participant: CallParticipant }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      if (isLocalParticipant(payload.participant)) return;
      setRemoteMedia((current) => upsertRemote(current, payload.participant));
      // Under LiveKit the newcomer's media arrives through the room, not a peer connection.
      if (callStateRef.current.transport !== 'livekit') {
        void createOffer(payload.participant.socketId, payload.channelId);
      }
    };

    const handleUserUpdated = (payload: { channelId: string; participant: CallParticipant }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      if (isLocalParticipant(payload.participant)) {
        setRemoteMedia((current) =>
          current.filter((item) => item.socketId !== payload.participant.socketId),
        );
        return;
      }
      setRemoteMedia((current) => upsertRemote(current, payload.participant));
    };

    const handleUserLeft = (payload: { channelId: string; socketId: string }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      closePeer(payload.socketId);
      setRemoteMedia((current) => current.filter((item) => item.socketId !== payload.socketId));
    };

    const handleOffer = async (payload: {
      channelId: string;
      fromSocketId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      const peer = createPeer(payload.fromSocketId, payload.channelId);
      await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('webrtc:answer', {
        channelId: payload.channelId,
        targetSocketId: payload.fromSocketId,
        answer,
      });
    };

    const handleAnswer = async (payload: {
      channelId: string;
      fromSocketId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      const peer = peersRef.current.get(payload.fromSocketId);
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
    };

    const handleIceCandidate = async (payload: {
      channelId: string;
      fromSocketId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (payload.channelId !== callStateRef.current?.channelId) return;
      const peer = peersRef.current.get(payload.fromSocketId);
      if (!peer) return;
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    };

    socket.on('voice:user-joined', handleUserJoined);
    socket.on('voice:user-updated', handleUserUpdated);
    socket.on('voice:user-left', handleUserLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('voice:user-joined', handleUserJoined);
      socket.off('voice:user-updated', handleUserUpdated);
      socket.off('voice:user-left', handleUserLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  });
  useEffect(() => attachCallListeners(), [socket]);

  /** Resolves false when the call could not start, e.g. media permission was denied. */
  async function startCall(mode: CallMode, options: StartCallOptions = {}): Promise<boolean> {
    const callId = options.callId ?? channel?.id;
    const label = options.label ?? (channel ? `#${channel.name}` : '');
    if (!callId || !auth || !socket) return false;
    if (callStateRef.current) {
      setWorkspaceError(t('call.leaveCurrentFirst'));
      return false;
    }
    try {
      const stream = options.receiveOnly
        ? null
        : mode === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: mode === 'video',
            });
      const nextState: CallState = {
        channelId: callId,
        label,
        mode,
        isMuted: Boolean(options.receiveOnly),
        isCameraOff: options.receiveOnly || mode === 'voice',
        isSharingScreen: !options.receiveOnly && mode === 'screen',
      };

      stream?.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (callStateRef.current?.isSharingScreen) {
            endCall();
          }
        };
      });

      localStreamRef.current = stream;
      callStateRef.current = nextState;
      setCallState(nextState);
      setRemoteMedia([]);

      socket.timeout(5000).emit(
        'voice:join',
        {
          channelId: callId,
          mode,
          isMuted: nextState.isMuted,
          isCameraOff: nextState.isCameraOff,
          isSharingScreen: nextState.isSharingScreen,
        },
        async (
          err: Error | null,
          result?: Partial<VoiceJoinTransportInfo> & {
            participants?: CallParticipant[];
            error?: string;
          },
        ) => {
          if (err) {
            setWorkspaceError(t('call.cannotJoin'));
            endCall();
            return;
          }
          if (result?.error) {
            setWorkspaceError(result.error);
            endCall();
            return;
          }

          const participants = (result?.participants ?? []).filter(
            (participant) => !isLocalParticipant(participant),
          );
          setRemoteMedia(participants);
          const transport = result?.transport ?? 'mesh';
          mergeCallState({ transport, stageRole: result?.stageRole });

          if (transport === 'livekit' && result?.livekit) {
            await joinLivekitRoom(result.livekit, mode);
            return;
          }
          await Promise.all(
            participants.map((participant) => createOffer(participant.socketId, callId)),
          );
        },
      );
      return true;
    } catch (err) {
      stopLocalStream();
      setWorkspaceError(err instanceof Error ? err.message : t('error.fallback.cannot-start-call'));
      return false;
    }
  }

  function endCall() {
    const activeChannelId = callStateRef.current?.channelId;
    if (activeChannelId) {
      socket?.emit('voice:leave', { channelId: activeChannelId });
    }
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    const session = roomRef.current;
    roomRef.current = null;
    void session?.room.disconnect();
    stopLocalStream();
    setRemoteMedia([]);
    callStateRef.current = null;
    setCallState(null);
  }

  function toggleMute() {
    if (!callState) return;
    const isMuted = !callState.isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    const session = roomRef.current;
    if (session) void session.api.setLocalMuted(session.room, 'audio', isMuted);
    updateCallState({ isMuted });
  }

  function toggleCamera() {
    if (!callState || callState.mode === 'voice') return;
    const isCameraOff = !callState.isCameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff;
    });
    const session = roomRef.current;
    if (session) void session.api.setLocalMuted(session.room, 'video', isCameraOff);
    updateCallState({ isCameraOff });
  }

  function updateCallState(patch: Partial<CallState>) {
    setCallState((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      callStateRef.current = next;
      socket?.emit('voice:state', next);
      return next;
    });
  }

  /** Local-only fields (transport, stage role) that the server already knows; no `voice:state`. */
  function mergeCallState(patch: Pick<CallState, 'transport' | 'stageRole'>) {
    const current = callStateRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    callStateRef.current = next;
    setCallState(next);
  }

  async function joinLivekitRoom(
    access: NonNullable<VoiceJoinTransportInfo['livekit']>,
    mode: CallMode,
  ) {
    try {
      const api = await import('./livekitCall');
      const room = await api.connectLivekitCall(access, {
        onRemoteStream: (socketId, stream) =>
          setRemoteMedia((current) =>
            current.map((item) => (item.socketId === socketId ? { ...item, stream } : item)),
          ),
        onDisconnected: (disconnected) => {
          // `endCall` disconnects on purpose and clears the ref first; anything else is a drop.
          if (roomRef.current?.room !== disconnected) return;
          setWorkspaceError(t('call.disconnected'));
          endCall();
        },
        onCanPublishChanged: (allowed) => void applyStagePublishRight(allowed),
      });
      if (!callStateRef.current) {
        // The call was left while the room was connecting.
        void room.disconnect();
        return;
      }
      roomRef.current = { room, api };
      const stream = localStreamRef.current;
      if (stream && api.canPublish(room)) {
        await api.publishStream(room, stream, mode);
      } else if (callStateRef.current.stageRole === 'speaker') {
        await applyStagePublishRight(true);
      }
    } catch {
      setWorkspaceError(t('call.cannotJoin'));
      endCall();
    }
  }

  /**
   * A stage speaker publishes their microphone; an audience member publishes nothing. The server
   * flips the right through LiveKit, so this follows LiveKit's permission event, not a socket event.
   */
  async function applyStagePublishRight(allowed: boolean) {
    const session = roomRef.current;
    const state = callStateRef.current;
    if (!session || !state?.stageRole) return;

    if (!allowed) {
      await session.api.unpublishAll(session.room);
      stopLocalStream();
      updateCallState({ stageRole: 'audience', isMuted: true });
      return;
    }
    if (!localStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (roomRef.current !== session) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        await session.api.publishStream(session.room, stream, 'voice');
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-start-call'),
        );
        return;
      }
    }
    updateCallState({ stageRole: 'speaker', isMuted: false });
  }

  async function createOffer(targetSocketId: string, channelId: string) {
    if (!socket) return;
    const peer = createPeer(targetSocketId, channelId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('webrtc:offer', { channelId, targetSocketId, offer });
  }

  function createPeer(targetSocketId: string, channelId: string) {
    const existingPeer = peersRef.current.get(targetSocketId);
    if (existingPeer) return existingPeer;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      const stream = localStreamRef.current;
      if (stream) {
        peer.addTrack(track, stream);
      }
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('webrtc:ice-candidate', {
          channelId,
          targetSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      setRemoteMedia((current) =>
        current.map((item) => (item.socketId === targetSocketId ? { ...item, stream } : item)),
      );
    };

    peer.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(peer.connectionState)) {
        closePeer(targetSocketId);
      }
    };

    peersRef.current.set(targetSocketId, peer);
    return peer;
  }

  function closePeer(socketId: string) {
    peersRef.current.get(socketId)?.close();
    peersRef.current.delete(socketId);
  }

  function stopLocalStream() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }

  function isLocalParticipant(participant: Pick<CallParticipant, 'socketId'>) {
    return Boolean(socket?.id && participant.socketId === socket.id);
  }

  function upsertRemote(current: RemoteMedia[], participant: CallParticipant) {
    if (isLocalParticipant(participant)) return current;

    const existing = current.find((item) => item.socketId === participant.socketId);
    if (!existing) return [...current, participant];
    return current.map((item) =>
      item.socketId === participant.socketId
        ? { ...item, ...participant, stream: item.stream }
        : item,
    );
  }

  return {
    callState,
    remoteMedia,
    localVideoRef,
    startCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
