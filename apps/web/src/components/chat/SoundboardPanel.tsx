import { useState } from 'react';
import { AudioLines, Loader2 } from 'lucide-react';
import { useServerSoundboard } from '@/hooks/useServerSoundboard';
import type { SoundboardPlayback } from '@/hooks/useSoundboardPlayback';
import { useTranslation } from '@/i18n/LocaleProvider';
import { IconButton, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui';
import styles from './SoundboardPanel.module.css';

interface SoundboardPanelProps {
  serverId: string;
  playback: SoundboardPlayback;
}

/** Clip buttons for the server voice call this client is in. The API re-checks every play. */
export function SoundboardPanel({ serverId, playback }: SoundboardPanelProps) {
  const t = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundboard = useServerSoundboard(isOpen ? serverId : null);

  async function play(clipId: string) {
    setPlayingId(clipId);
    setError(null);
    const refusal = await playback.play(clipId);
    setPlayingId(null);
    if (refusal !== null) setError(refusal || t('error.fallback.cannot-play-soundboard'));
  }

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <IconButton label={t('soundboard.panel.open')}>
          <AudioLines size={17} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end">
        <div className={styles.panel}>
          {error ? (
            <p className={styles.note} role="alert">
              {error}
            </p>
          ) : null}
          {soundboard.isLoading ? (
            <p className={styles.note} role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" /> {t('soundboard.loading')}
            </p>
          ) : soundboard.error ? (
            <p className={styles.note} role="alert">
              {soundboard.error.message || t('error.fallback.cannot-load-soundboard')}
            </p>
          ) : soundboard.clips.length ? (
            <div className={styles.grid} role="group" aria-label={t('soundboard.panel.label')}>
              {soundboard.clips.map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  aria-label={t('soundboard.panel.play', { name: clip.name })}
                  disabled={playingId === clip.id}
                  onClick={() => void play(clip.id)}
                >
                  {clip.name}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.note}>{t('soundboard.panel.empty')}</p>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
