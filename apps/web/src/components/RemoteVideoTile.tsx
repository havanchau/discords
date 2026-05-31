import { useEffect, useRef } from 'react';
import { accentClass, initials, RemoteMedia } from '../helpers';

export function RemoteVideoTile({ participant }: { participant: RemoteMedia }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream ?? null;
    }
  }, [participant.stream]);

  return (
    <div className="call-tile">
      {participant.stream ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className={`avatar call-avatar ${accentClass(participant.userId)}`}>
          {initials(participant.displayName)}
        </div>
      )}
      <div className="call-label">
        <strong>{participant.displayName}</strong>
        <span>{participant.isSharingScreen ? 'Sharing screen' : participant.isMuted ? 'Muted' : 'In call'}</span>
      </div>
    </div>
  );
}
