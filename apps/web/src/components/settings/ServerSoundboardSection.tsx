import { useRef, useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  MAX_SOUNDBOARD_CLIPS_PER_SERVER,
  SERVER_ASSET_NAME_PATTERN,
  SOUNDBOARD_CLIP_MAX_BYTES,
  SOUNDBOARD_CLIP_MAX_DURATION_MS,
  SOUNDBOARD_CLIP_MIME_TYPES,
} from '@discord-clone/shared';
import { assetUrl, type ServerDetail } from '@/api';
import { Button, IconButton, TextField } from '@/components/ui';
import { useServerSoundboard } from '@/hooks/useServerSoundboard';
import { useTranslation } from '@/i18n/LocaleProvider';
import { measureAudioDurationMs } from '@/utils/audioDuration';
import { assetNameFromFile } from './serverAssetName';
import styles from '@/components/SettingsModal.module.css';

const ACCEPTED_TYPES: readonly string[] = SOUNDBOARD_CLIP_MIME_TYPES;

/** The server's soundboard clips. Rendered only for MANAGE_SERVER holders; the API re-checks. */
export function ServerSoundboardSection({ server }: { server: ServerDetail }) {
  const t = useTranslation();
  const soundboard = useServerSoundboard(server.id);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFull = soundboard.clips.length >= MAX_SOUNDBOARD_CLIPS_PER_SERVER;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !name) return;
    // Type and size are re-checked by the API; the duration is measured only here (see audioDuration).
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('soundboard.error.type'));
      return;
    }
    if (file.size > SOUNDBOARD_CLIP_MAX_BYTES) {
      setError(t('soundboard.error.size'));
      return;
    }
    const durationMs = await measureAudioDurationMs(file);
    if (durationMs === null) {
      setError(t('soundboard.error.unreadable'));
      return;
    }
    if (durationMs > SOUNDBOARD_CLIP_MAX_DURATION_MS) {
      setError(t('soundboard.error.duration'));
      return;
    }
    setError(null);
    try {
      await soundboard.createClip({ file, name, durationMs });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-add-soundboard-clip'));
      return;
    }
    setFile(null);
    setName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function remove(clipId: string) {
    setError(null);
    try {
      await soundboard.deleteClip(clipId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-delete-soundboard-clip'),
      );
    }
  }

  return (
    <section className={styles.settingsSection} aria-labelledby="server-soundboard-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="server-soundboard-title">
          {t('soundboard.section.title', {
            count: soundboard.clips.length,
            max: MAX_SOUNDBOARD_CLIPS_PER_SERVER,
          })}
        </strong>
        <span>{t('soundboard.section.hint')}</span>
      </div>
      <form className={styles.moderationRow} onSubmit={(event) => void submit(event)}>
        <TextField
          label={t('soundboard.field.name')}
          value={name}
          pattern={SERVER_ASSET_NAME_PATTERN.slice(1, -1)}
          title={t('emoji.field.nameRule')}
          onChange={(event) => setName(event.target.value)}
          disabled={isFull}
          required
        />
        <input
          ref={fileInputRef}
          className={styles.hiddenInput}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          aria-label={t('soundboard.field.audio')}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            if (selected && !name) setName(assetNameFromFile(selected.name));
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={isFull}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? file.name : t('soundboard.action.chooseAudio')}
        </Button>
        <Button type="submit" disabled={isFull || !file || !name || soundboard.isCreating}>
          {soundboard.isCreating ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('soundboard.action.upload')}
        </Button>
      </form>
      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.inviteList}>
        {soundboard.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('soundboard.loading')}
          </p>
        ) : soundboard.error ? (
          <p className="empty-note" role="alert">
            {soundboard.error.message || t('error.fallback.cannot-load-soundboard')}
          </p>
        ) : soundboard.clips.length ? (
          soundboard.clips.map((clip) => (
            <div className={styles.inviteRow} key={clip.id}>
              <div>
                <strong>{clip.name}</strong>
                <small>
                  {t('soundboard.duration', { seconds: (clip.durationMs / 1000).toFixed(1) })}
                </small>
              </div>
              <audio src={assetUrl(clip.url)} controls preload="none" aria-label={clip.name} />
              <IconButton
                label={t('soundboard.action.delete', { name: clip.name })}
                variant="danger"
                size="sm"
                disabled={soundboard.pendingDeleteId === clip.id}
                onClick={() => void remove(clip.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </div>
          ))
        ) : (
          <p className="empty-note">{t('soundboard.empty')}</p>
        )}
      </div>
    </section>
  );
}
