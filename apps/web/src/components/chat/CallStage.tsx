import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { accentClass, initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { RemoteVideoTile } from '@/components/RemoteVideoTile';
import { Avatar, Button, IconButton } from '@/components/ui';
import { SoundboardPanel } from './SoundboardPanel';
import styles from './CallStage.module.css';
import type { ChatPanelCall, ChatPanelSession } from './types';

interface CallStageProps {
  session: ChatPanelSession;
  call: ChatPanelCall;
  /** Where the call happens, e.g. `#general` or a DM name; defaults to the selected channel. */
  contextLabel?: string;
}

export function CallStage({ session, call, contextLabel }: CallStageProps) {
  const t = useTranslation();
  const { auth, channel } = session;
  const { active, state, remoteMedia } = call;

  if (!active && !state) return null;
  const bannerLabel = contextLabel ?? `#${channel?.name ?? ''}`;
  // The panel needs the call's server, known only while the call's own channel is the open one.
  const soundboardServerId =
    state && call.soundboard && channel?.id === state.channelId ? channel.serverId : null;
  const lastPlayed = call.soundboard?.lastPlayed ?? null;

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
                ? t('call.userSharingScreen', {
                    user: active.screenSharer?.displayName ?? t('call.someone'),
                  })
                : active.mode === 'video'
                  ? t('call.videoCallActive')
                  : t('call.voiceCallActive')}
            </strong>
            <span>
              {bannerLabel} - {active.participants.length}{' '}
              {t(
                active.participants.length === 1
                  ? 'call.participantSingular'
                  : 'call.participantPlural',
              )}
            </span>
          </div>
          <Button
            size="sm"
            className={styles.activeCallJoin}
            onClick={() => void call.start('voice', { receiveOnly: true })}
          >
            {active.mode === 'screen' ? t('call.joinStream') : t('call.joinCall')}
          </Button>
        </section>
      ) : null}

      {state ? (
        <section className={styles.callStage} data-testid="call-stage">
          <div className={styles.callStageHeader}>
            <div>
              <strong>
                {state.isSharingScreen
                  ? t('call.screenShare')
                  : state.mode === 'video'
                    ? t('call.videoCall')
                    : t('call.voiceCall')}
              </strong>
              <span>
                {state.label} - {remoteMedia.length + 1}{' '}
                {t(remoteMedia.length ? 'call.participantPlural' : 'call.participantSingular')}
              </span>
              {lastPlayed ? (
                <span className={styles.soundboardPlayed} role="status">
                  {t('soundboard.played', {
                    user: lastPlayed.triggeredBy.displayName,
                    name: lastPlayed.name,
                  })}
                  {call.soundboard?.playbackFailed ? ` - ${t('soundboard.playbackBlocked')}` : ''}
                </span>
              ) : null}
            </div>
            <div className={styles.callControls}>
              {soundboardServerId && call.soundboard ? (
                <SoundboardPanel serverId={soundboardServerId} playback={call.soundboard} />
              ) : null}
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
              <IconButton label={t('call.leave')} variant="danger" onClick={call.end}>
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
                  {state.isSharingScreen
                    ? t('call.sharingScreen')
                    : state.isMuted
                      ? t('call.muted')
                      : t('call.you')}
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
