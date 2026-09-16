import { useServerEmojiContext } from '../../contexts/ServerEmojiContext';
import { useTranslation } from '../../i18n/LocaleProvider';
import styles from './EmojiPicker.module.css';

export const UNICODE_EMOJI_OPTIONS = [
  '👍',
  '🔥',
  '😂',
  '❤️',
  '🎉',
  '👏',
  '🙏',
  '😍',
  '😮',
  '😢',
  '😡',
  '✅',
  '👀',
  '💯',
  '🚀',
  '✨',
];

interface EmojiPickerProps {
  /** Receives a Unicode emoji or a `:name:` shortcode for a server emoji. */
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const t = useTranslation();
  const { emojis, resolveEmoji } = useServerEmojiContext();

  return (
    <div className={styles.picker}>
      <div className={styles.grid} role="group" aria-label={t('emoji.picker.label')}>
        {UNICODE_EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Emoji ${emoji}`}
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      {emojis.length ? (
        <>
          <strong className={styles.sectionTitle}>{t('emoji.picker.serverSection')}</strong>
          <div className={styles.grid} role="group" aria-label={t('emoji.picker.serverSection')}>
            {emojis.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                aria-label={`Emoji :${emoji.name}:`}
                title={`:${emoji.name}:`}
                onClick={() => onSelect(`:${emoji.name}:`)}
              >
                <img src={resolveEmoji(emoji.name)} alt="" />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Renders a reaction value: a Unicode emoji, or a server emoji image for a known `:name:`. */
export function ReactionEmoji({ emoji }: { emoji: string }) {
  const { resolveEmoji } = useServerEmojiContext();
  const match = /^:([a-zA-Z0-9_]{2,32}):$/.exec(emoji);
  const url = match ? resolveEmoji(match[1]) : undefined;
  return url ? (
    <img className={styles.reactionImage} src={url} alt={emoji} />
  ) : (
    <span>{emoji}</span>
  );
}
