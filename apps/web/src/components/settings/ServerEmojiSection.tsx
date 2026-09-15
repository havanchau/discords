import { useRef, useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { assetUrl } from '../../api';
import { Button, IconButton, TextField } from '../ui';
import type { SettingsModalFields } from './types';
import styles from '../SettingsModal.module.css';

const MAX_EMOJIS = 50;

type ServerEmojiSectionProps = Pick<
  SettingsModalFields,
  'emojis' | 'isLoadingEmojis' | 'emojisError' | 'createEmoji' | 'deleteEmoji'
>;

function nameFromFile(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 32);
}

export function ServerEmojiSection({
  emojis,
  isLoadingEmojis,
  emojisError,
  createEmoji,
  deleteEmoji,
}: ServerEmojiSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const isFull = emojis.length >= MAX_EMOJIS;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !name) return;
    setIsUploading(true);
    const created = await createEmoji(file, name);
    setIsUploading(false);
    if (!created) return;
    setFile(null);
    setName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className={styles.settingsSection} aria-labelledby="server-emoji-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="server-emoji-title">
          Emoji ({emojis.length}/{MAX_EMOJIS})
        </strong>
        <span>PNG, GIF, WEBP, or JPEG up to 256 KB. Members use them as :name:.</span>
      </div>
      <form className={styles.moderationRow} onSubmit={submit}>
        <TextField
          label="Emoji name"
          value={name}
          pattern="[a-zA-Z0-9_]{2,32}"
          title="2-32 letters, numbers, or underscores"
          onChange={(event) => setName(event.target.value)}
          disabled={isFull}
          required
        />
        <input
          ref={fileInputRef}
          className={styles.hiddenInput}
          type="file"
          accept="image/png,image/gif,image/webp,image/jpeg"
          aria-label="Emoji image"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            if (selected && !name) setName(nameFromFile(selected.name));
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={isFull}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? file.name : 'Choose image'}
        </Button>
        <Button type="submit" disabled={isFull || !file || !name || isUploading}>
          {isUploading ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          Upload
        </Button>
      </form>
      {emojisError ? (
        <p className="empty-note" role="alert">
          {emojisError}
        </p>
      ) : null}
      <div className={styles.inviteList}>
        {isLoadingEmojis ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> Loading emoji
          </p>
        ) : emojis.length ? (
          emojis.map((emoji) => (
            <div className={styles.inviteRow} key={emoji.id}>
              <div className={styles.emojiRowIdentity}>
                <img src={assetUrl(emoji.url)} alt="" width={24} height={24} />
                <strong>:{emoji.name}:</strong>
              </div>
              <span />
              <IconButton
                label={`Delete emoji ${emoji.name}`}
                variant="danger"
                size="sm"
                onClick={() => void deleteEmoji(emoji.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </div>
          ))
        ) : (
          <p className="empty-note">No custom emoji yet.</p>
        )}
      </div>
    </section>
  );
}
