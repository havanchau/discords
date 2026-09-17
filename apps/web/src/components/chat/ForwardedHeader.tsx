import { Forward } from 'lucide-react';
import type { ForwardOrigin } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { MarkdownContent } from './MarkdownContent';
import styles from './ForwardedHeader.module.css';

/** The snapshot a forwarded message carries, shown above the forwarder's own comment. */
export function ForwardedHeader({ origin }: { origin: ForwardOrigin }) {
  const t = useTranslation();
  const source = origin.channelName
    ? t('forward.fromChannel', { channel: origin.channelName })
    : t('forward.fromDirect');

  return (
    <div className={styles.forwarded} data-testid="forwarded-header">
      <span className={styles.label}>
        <Forward size={12} aria-hidden="true" />
        {source}
      </span>
      <div className={styles.quote}>
        <strong className={styles.author}>{origin.authorName}</strong>
        {origin.content ? (
          <MarkdownContent className={styles.content} content={origin.content} />
        ) : null}
      </div>
    </div>
  );
}
