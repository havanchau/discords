import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { VOICE_WAVEFORM_MAX_PEAK } from '@discord-clone/shared';
import { IconButton } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { formatVoiceDuration } from '@/utils/voiceRecording';
import styles from './VoiceMessagePlayer.module.css';

/** A bar never drops below this share of the height, so silence still reads as part of the note. */
const MIN_BAR_PERCENT = 8;

type VoiceMessagePlayerProps = {
  url: string;
  durationMs: number;
  waveform: number[];
};

/** Player for a recorded voice message: its real duration and the waveform measured at record time. */
export function VoiceMessagePlayer({ url, durationMs, waveform }: VoiceMessagePlayerProps) {
  const t = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const progress = Math.min(1, positionMs / durationMs);
  const playedBars = Math.round(progress * waveform.length);
  const durationLabel = formatVoiceDuration(durationMs);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      // `play()` rejects when the file cannot be decoded or playback is blocked; the row shows it.
      setHasFailed(true);
    }
  }

  return (
    <div
      className={styles.player}
      role="group"
      aria-label={t('voice.message', { duration: durationLabel })}
    >
      <IconButton
        label={isPlaying ? t('voice.pause') : t('voice.play')}
        className={styles.playButton}
        disabled={hasFailed}
        onClick={() => void togglePlayback()}
      >
        {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </IconButton>
      {hasFailed ? (
        <span className={styles.error}>{t('voice.playbackFailed')}</span>
      ) : (
        <div className={styles.waveform} aria-hidden="true">
          {waveform.map((peak, index) => (
            <i
              key={index}
              className={cn(index < playedBars && styles.played)}
              style={{
                height: `${Math.max(MIN_BAR_PERCENT, (peak / VOICE_WAVEFORM_MAX_PEAK) * 100)}%`,
              }}
            />
          ))}
        </div>
      )}
      <span className={styles.time}>
        {isPlaying || positionMs > 0 ? formatVoiceDuration(positionMs) : durationLabel}
      </span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setPositionMs(event.currentTarget.currentTime * 1000)}
        onEnded={() => {
          setIsPlaying(false);
          setPositionMs(0);
        }}
        onError={() => setHasFailed(true)}
      />
    </div>
  );
}
