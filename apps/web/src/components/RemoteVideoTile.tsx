import { useEffect, useRef } from 'react';
import { accentClass, initials, RemoteMedia } from '../helpers';
import { cn } from '../utils/cn';
import styles from './RemoteVideoTile.module.css';

export function RemoteVideoTile({ participant }: { participant: RemoteMedia }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream ?? null;
    }
  }, [participant.stream]);

  return (
    <div className={cn(styles.tile, 'call-tile')}>
      {participant.stream ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className={cn('avatar', styles.callAvatar, accentClass(participant.userId))}>
          {initials(participant.displayName)}
        </div>
      )}
      <div className={styles.label}>
        <strong>{participant.displayName}</strong>
        <span>{participant.isSharingScreen ? 'Sharing screen' : participant.isMuted ? 'Muted' : 'In call'}</span>
      </div>
    </div>
  );
}
