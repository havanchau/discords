import { useEffect, useRef } from 'react';
import { accentClass, initials, RemoteMedia } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import styles from './RemoteVideoTile.module.css';

export function RemoteVideoTile({ participant }: { participant: RemoteMedia }) {
  const t = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const hasVideo = Boolean(participant.stream?.getVideoTracks().length);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream ?? null;
    }
  }, [participant.stream]);

  return (
    <div
      className={cn(styles.tile, participant.isSharingScreen && styles.screenShare, 'call-tile')}
    >
      {/* An audio-only stream still plays through the (hidden) element; the avatar stands in. */}
      {participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={hasVideo ? undefined : styles.audioOnly}
        />
      ) : null}
      {hasVideo ? null : (
        <div className={cn('avatar', styles.callAvatar, accentClass(participant.userId))}>
          {initials(participant.displayName)}
        </div>
      )}
      <div className={styles.label}>
        <strong>{participant.displayName}</strong>
        <span>
          {participant.isSharingScreen
            ? t('call.sharingScreen')
            : participant.isMuted
              ? t('call.muted')
              : t('call.inCall')}
        </span>
      </div>
    </div>
  );
}
