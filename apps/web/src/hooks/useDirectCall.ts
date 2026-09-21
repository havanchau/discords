import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import type { PublicUser } from '@/api';
import type { CallState, RemoteMedia } from '@/helpers';
import type { StartCallOptions } from './useChannelCall';
import { useTranslation } from '@/i18n/LocaleProvider';

export type DirectCallMode = 'voice' | 'video' | 'screen';

export interface IncomingDirectCall {
  conversationId: string;
  mode: DirectCallMode;
  caller: Pick<PublicUser, 'id' | 'displayName' | 'avatarUrl'>;
}

export interface OutgoingDirectCall {
  conversationId: string;
  mode: DirectCallMode;
}

type RingStopReason = 'answered' | 'declined' | 'cancelled' | 'missed';

export function directCallId(conversationId: string) {
  return `dm:${conversationId}`;
}

interface UseDirectCallOptions {
  socket: Socket | null;
  viewerId: string | null;
  callState: CallState | null;
  remoteMedia: RemoteMedia[];
  startCall: (mode: DirectCallMode, options?: StartCallOptions) => Promise<boolean>;
  endCall: () => void;
  getConversationLabel: (conversationId: string, fallback: string) => string;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

/** Ringing for DM calls; media itself runs through useChannelCall with a `dm:` call id. */
export function useDirectCall({
  socket,
  viewerId,
  callState,
  remoteMedia,
  startCall,
  endCall,
  getConversationLabel,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseDirectCallOptions) {
  const t = useTranslation();
  const [incomingCall, setIncomingCall] = useState<IncomingDirectCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingDirectCall | null>(null);
  const outgoingCallRef = useRef<OutgoingDirectCall | null>(null);
  const handlersRef = useRef({ endCall, setWorkspaceNotice });

  useEffect(() => {
    outgoingCallRef.current = outgoingCall;
  }, [outgoingCall]);

  useEffect(() => {
    handlersRef.current = { endCall, setWorkspaceNotice };
  }, [endCall, setWorkspaceNotice]);

  // Once someone is connected the caller is no longer "ringing".
  useEffect(() => {
    if (outgoingCall && remoteMedia.length > 0) setOutgoingCall(null);
  }, [outgoingCall, remoteMedia.length]);

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = (payload: IncomingDirectCall) => setIncomingCall(payload);

    const handleRingStopped = (payload: {
      conversationId: string;
      reason: RingStopReason;
      userId?: string;
    }) => {
      setIncomingCall((current) =>
        current?.conversationId === payload.conversationId ? null : current,
      );
      const outgoing = outgoingCallRef.current;
      if (outgoing?.conversationId !== payload.conversationId) return;
      setOutgoingCall(null);
      if (payload.reason === 'declined' || payload.reason === 'missed') {
        handlersRef.current.endCall();
        handlersRef.current.setWorkspaceNotice(
          payload.reason === 'declined' ? 'Call declined.' : 'No answer.',
        );
      }
    };

    socket.on(RealtimeEvents.DmCallIncoming, handleIncoming);
    socket.on(RealtimeEvents.DmCallRingStopped, handleRingStopped);
    return () => {
      socket.off(RealtimeEvents.DmCallIncoming, handleIncoming);
      socket.off(RealtimeEvents.DmCallRingStopped, handleRingStopped);
    };
  }, [socket]);

  async function startDirectCall(conversationId: string, mode: DirectCallMode, label: string) {
    if (!socket || !viewerId) return;
    if (callState) {
      setWorkspaceError(t('call.leaveCurrentFirst'));
      return;
    }
    // Join first: if media is denied nobody should be left ringing for an empty call.
    const started = await startCall(mode, { callId: directCallId(conversationId), label });
    if (!started) return;
    const ringResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      socket
        .timeout(5000)
        .emit(
          RealtimeEvents.DmCallRing,
          { conversationId, mode },
          (err: Error | null, result?: { ok?: boolean; error?: string }) => {
            if (err) return resolve({ ok: false });
            if (result?.error) return resolve({ ok: false, error: result.error });
            return resolve({ ok: Boolean(result?.ok) });
          },
        );
    });
    if (!ringResult.ok) {
      endCall();
      setWorkspaceError(ringResult.error ?? t('call.cannotStart'));
      return;
    }
    setOutgoingCall({ conversationId, mode });
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    if (callState) endCall();
    const options = {
      callId: directCallId(call.conversationId),
      label: getConversationLabel(call.conversationId, call.caller.displayName),
    };
    // A screen call is the caller's share: the callee watches it, like a channel's "Join stream",
    // instead of being asked to share their own screen.
    await (call.mode === 'screen'
      ? startCall('voice', { ...options, receiveOnly: true })
      : startCall(call.mode, options));
  }

  function declineIncomingCall() {
    if (!incomingCall) return;
    socket
      ?.timeout(5000)
      .emit(
        RealtimeEvents.DmCallDecline,
        { conversationId: incomingCall.conversationId },
        (err: Error | null, result?: { error?: string }) => {
          if (!err && result?.error) setWorkspaceError(result.error);
        },
      );
    setIncomingCall(null);
  }

  /** Hangs up; while still ringing this also cancels the ring for everyone. */
  function endDirectCall() {
    const outgoing = outgoingCallRef.current;
    if (outgoing) {
      socket
        ?.timeout(5000)
        .emit(
          RealtimeEvents.DmCallCancel,
          { conversationId: outgoing.conversationId },
          (err: Error | null, result?: { error?: string }) => {
            if (!err && result?.error) setWorkspaceError(result.error);
          },
        );
      setOutgoingCall(null);
    }
    endCall();
  }

  return {
    incomingCall,
    outgoingCall,
    startDirectCall,
    acceptIncomingCall,
    declineIncomingCall,
    endDirectCall,
  };
}
