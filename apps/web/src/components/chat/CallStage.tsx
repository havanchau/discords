import { RefObject } from 'react';
import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { AuthState, Channel } from '../../api';
import { accentClass, ActiveCallSummary, CallState, initials, RemoteMedia } from '../../helpers';
import { Avatar, Button, IconButton } from '../ui';
import { RemoteVideoTile } from '../RemoteVideoTile';
import styles from './CallStage.module.css';
import { cn } from '../../utils/cn';

interface CallStageProps {
  auth: AuthState;
  channel: Channel | null;
  activeCall: ActiveCallSummary | null;
  callState: CallState | null;
  remoteMedia: RemoteMedia[];
  localVideoRef: RefObject<HTMLVideoElement | null>;
  startCall: (mode: 'voice' | 'video' | 'screen', options?: { receiveOnly?: boolean }) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  endCall: () => void;
}

export function CallStage({
  auth,
  channel,
  activeCall,
  callState,
  remoteMedia,
  localVideoRef,
  startCall,
  toggleMute,
  toggleCamera,
  endCall,
}: CallStageProps) {
  if (!activeCall && !callState) return null;

  return (
    <>
      {activeCall && !callState ? (
        <section className={styles.activeCallBanner} data-testid="active-call-banner">
          <div className={styles.activeCallIcon}>
            {activeCall.mode === 'screen' ? (
              <MonitorUp size={18} aria-hidden="true" />
            ) : activeCall.mode === 'video' ? (
              <Video size={18} aria-hidden="true" />
            ) : (
              <Phone size={18} aria-hidden="true" />
            )}
          </div>
          <div className={styles.activeCallCopy}>
            <strong>
              {activeCall.mode === 'screen'
                ? `${activeCall.screenSharer?.displayName ?? 'Someone'} is sharing screen`
                : activeCall.mode === 'video'
                  ? 'Video call is active'
                  : 'Voice call is active'}
            </strong>
            <span>
              #{channel?.name} · {activeCall.participants.length} participant
              {activeCall.participants.length === 1 ? '' : 's'}
            </span>
          </div>
          <Button
            size="sm"
            className={styles.activeCallJoin}
            onClick={() => void startCall('voice', { receiveOnly: true })}
          >
            {activeCall.mode === 'screen' ? 'Join stream' : 'Join call'}
          </Button>
        </section>
      ) : null}

      {callState ? (
        <section className={styles.callStage} data-testid="call-stage">
          <div className={styles.callStageHeader}>
            <div>
              <strong>
                {callState.isSharingScreen
                  ? 'Screen share'
                  : callState.mode === 'video'
                    ? 'Video call'
                    : 'Voice call'}
              </strong>
              <span>
                #{channel?.name} · {remoteMedia.length + 1} participant
                {remoteMedia.length ? 's' : ''}
              </span>
            </div>
            <div className={styles.callControls}>
              <IconButton
                label={callState.isMuted ? 'Unmute' : 'Mute'}
                variant={callState.isMuted ? 'danger' : 'ghost'}
                onClick={toggleMute}
              >
                {callState.isMuted ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
              </IconButton>
              <IconButton
                label={callState.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                onClick={toggleCamera}
                disabled={callState.mode === 'voice'}
              >
                {callState.isCameraOff ? <VideoOff size={17} aria-hidden="true" /> : <Video size={17} aria-hidden="true" />}
              </IconButton>
              <IconButton
                label="Leave call"
                variant="danger"
                onClick={endCall}
              >
                <PhoneOff size={17} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <div className={styles.callGrid}>
            <div className={cn(styles.callTile, styles.callTileLocal)}>
              {callState.mode !== 'voice' && !callState.isCameraOff ? (
                <video ref={localVideoRef} autoPlay muted playsInline />
              ) : (
                <Avatar
                  alt={auth.user.displayName}
                  fallback={initials(auth.user.displayName)}
                  className={cn(styles.callAvatar, accentClass(auth.user.id))}
                />
              )}
              <div className={styles.callLabel}>
                <strong>{auth.user.displayName}</strong>
                <span>
                  {callState.isSharingScreen
                    ? 'Sharing screen'
                    : callState.isMuted
                      ? 'Muted'
                      : 'You'}
                </span>
              </div>
            </div>
            {remoteMedia.map((participant) => (
              <RemoteVideoTile key={participant.socketId} participant={participant} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
