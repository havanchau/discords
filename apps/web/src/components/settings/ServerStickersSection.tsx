import { useRef, useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  MAX_STICKERS_PER_SERVER,
  SERVER_ASSET_NAME_PATTERN,
  STICKER_MAX_BYTES,
  STICKER_MIME_TYPES,
} from '@discord-clone/shared';
import { assetUrl, type ServerDetail } from '@/api';
import { Button, IconButton, TextField } from '@/components/ui';
import { useServerStickers } from '@/hooks/useServerStickers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { assetNameFromFile } from './serverAssetName';
import styles from '@/components/SettingsModal.module.css';

const ACCEPTED_TYPES: readonly string[] = STICKER_MIME_TYPES;

/** The server's stickers. Rendered only for MANAGE_SERVER holders; the API re-checks. */
export function ServerStickersSection({ server }: { server: ServerDetail }) {
  const t = useTranslation();
  const stickers = useServerStickers(server.id);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFull = stickers.stickers.length >= MAX_STICKERS_PER_SERVER;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !name) return;
    // Checked here for a quick answer; the API sniffs the bytes and enforces both limits itself.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('sticker.error.type'));
      return;
    }
    if (file.size > STICKER_MAX_BYTES) {
      setError(t('sticker.error.size'));
      return;
    }
    setError(null);
    try {
      await stickers.createSticker({ file, name });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-add-sticker'));
      return;
    }
    setFile(null);
    setName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function remove(stickerId: string) {
    setError(null);
    try {
      await stickers.deleteSticker(stickerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-delete-sticker'));
    }
  }

  return (
    <section className={styles.settingsSection} aria-labelledby="server-stickers-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="server-stickers-title">
          {t('sticker.section.title', {
            count: stickers.stickers.length,
            max: MAX_STICKERS_PER_SERVER,
          })}
        </strong>
        <span>{t('sticker.section.hint')}</span>
      </div>
      <form className={styles.moderationRow} onSubmit={(event) => void submit(event)}>
        <TextField
          label={t('sticker.field.name')}
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
          aria-label={t('sticker.field.image')}
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
          {file ? file.name : t('sticker.action.chooseImage')}
        </Button>
        <Button type="submit" disabled={isFull || !file || !name || stickers.isCreating}>
          {stickers.isCreating ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('sticker.action.upload')}
        </Button>
      </form>
      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.inviteList}>
        {stickers.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('sticker.loading')}
          </p>
        ) : stickers.error ? (
          <p className="empty-note" role="alert">
            {stickers.error.message || t('error.fallback.cannot-load-stickers')}
          </p>
        ) : stickers.stickers.length ? (
          stickers.stickers.map((sticker) => (
            <div className={styles.inviteRow} key={sticker.id}>
              <div className={styles.emojiRowIdentity}>
                <img src={assetUrl(sticker.url)} alt="" width={24} height={24} />
                <strong>{sticker.name}</strong>
              </div>
              <span />
              <IconButton
                label={t('sticker.action.delete', { name: sticker.name })}
                variant="danger"
                size="sm"
                disabled={stickers.pendingDeleteId === sticker.id}
                onClick={() => void remove(sticker.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </div>
          ))
        ) : (
          <p className="empty-note">{t('sticker.empty')}</p>
        )}
      </div>
    </section>
  );
}
