import { Loader2 } from 'lucide-react';
import { assetUrl } from '@/api';
import { useServerStickers } from '@/hooks/useServerStickers';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './StickerPicker.module.css';

interface StickerPickerProps {
  serverId: string;
  /** Sends the sticker at once, as its own message, like Discord. */
  onSelect: (stickerId: string) => void;
}

export function StickerPicker({ serverId, onSelect }: StickerPickerProps) {
  const t = useTranslation();
  const { stickers, isLoading, error } = useServerStickers(serverId);

  if (isLoading) {
    return (
      <p className={styles.note} role="status">
        <Loader2 className="spin" size={14} aria-hidden="true" /> {t('sticker.loading')}
      </p>
    );
  }
  if (error) {
    return (
      <p className={styles.note} role="alert">
        {error.message || t('error.fallback.cannot-load-stickers')}
      </p>
    );
  }
  if (!stickers.length) return <p className={styles.note}>{t('sticker.picker.empty')}</p>;

  return (
    <div className={styles.picker} role="group" aria-label={t('sticker.picker.label')}>
      {stickers.map((sticker) => (
        <button
          key={sticker.id}
          type="button"
          aria-label={t('sticker.picker.send', { name: sticker.name })}
          title={sticker.name}
          onClick={() => onSelect(sticker.id)}
        >
          <img src={assetUrl(sticker.url)} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}
