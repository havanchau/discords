import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { accentClass, initials } from '../../helpers';
import { cn } from '../../utils/cn';
import { RemoteVideoTile } from '../RemoteVideoTile';
import { Avatar, Button, IconButton } from '../ui';
import styles from './CallStage.module.css';
import type { ChatPanelCall, ChatPanelSession } from './types';

interface CallStageProps {
  session: ChatPanelSession;
  call: ChatPanelCall;
}

export function CallStage({ session, call }: CallStageProps) {
  const { auth, channel } = session;
  const { active, state, remoteMedia } = call;

  if (!active && !state) return null;

  return (
    <>
      {active && !state ? (
        <section className={styles.activeCallBanner} data-testid="active-call-banner">
          <div className={styles.activeCallIcon}>
            {active.mode === 'screen' ? (
              <MonitorUp size={18} aria-hidden="true" />
            ) : active.mode === 'video' ? (
              <Video size={18} aria-hidden="true" />
            ) : (
              <Phone size={18} aria-hidden="true" />
            )}
          </div>
          <div className={styles.activeCallCopy}>
            <strong>
              {active.mode === 'screen'
                ? `${active.screenSharer?.displayName ?? 'Someone'} is sharing screen`
                : active.mode === 'video'
                  ? 'Video call is active'
                  : 'Voice call is active'}
            </strong>
            <span>
              #{channel?.name} - {active.participants.length} participant
              {active.participants.length === 1 ? '' : 's'}
            </span>
          </div>
          <Button
            size="sm"
            className={styles.activeCallJoin}
            onClick={() => void call.start('voice', { receiveOnly: true })}
          >
            {active.mode === 'screen' ? 'Join stream' : 'Join call'}
          </Button>
        </section>
      ) : null}

      {state ? (
        <section className={styles.callStage} data-testid="call-stage">
          <div className={styles.callStageHeader}>
            <div>
              <strong>
                {state.isSharingScreen
                  ? 'Screen share'
                  : state.mode === 'video'
                    ? 'Video call'
                    : 'Voice call'}
              </strong>
              <span>
                #{channel?.name} - {remoteMedia.length + 1} participant
                {remoteMedia.length ? 's' : ''}
              </span>
            </div>
            <div className={styles.callControls}>
              <IconButton
                label={state.isMuted ? 'Unmute' : 'Mute'}
                variant={state.isMuted ? 'danger' : 'ghost'}
                onClick={call.toggleMute}
              >
                {state.isMuted ? (
                  <MicOff size={17} aria-hidden="true" />
                ) : (
                  <Mic size={17} aria-hidden="true" />
                )}
              </IconButton>
              <IconButton
                label={state.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                onClick={call.toggleCamera}
                disabled={state.mode === 'voice'}
              >
                {state.isCameraOff ? (
                  <VideoOff size={17} aria-hidden="true" />
                ) : (
                  <Video size={17} aria-hidden="true" />
                )}
              </IconButton>
              <IconButton label="Leave call" variant="danger" onClick={call.end}>
                <PhoneOff size={17} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <div className={styles.callGrid}>
            <div
              className={cn(
                styles.callTile,
                !state.isSharingScreen && styles.callTileMirrorPreview,
              )}
            >
              {state.mode !== 'voice' && !state.isCameraOff ? (
                <video ref={call.localVideoRef} autoPlay muted playsInline />
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
                  {state.isSharingScreen ? 'Sharing screen' : state.isMuted ? 'Muted' : 'You'}
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
