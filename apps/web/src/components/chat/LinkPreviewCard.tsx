import { Link as LinkIcon } from 'lucide-react';
import { useLinkPreview } from '../../hooks/useLinkPreview';
import styles from './LinkPreviewCard.module.css';

interface LinkPreviewCardProps {
  url: string;
  /** False for end-to-end encrypted messages: their URLs must never reach the server. */
  canFetchPreview: boolean;
  accessToken: string;
}

export function LinkPreviewCard({ url, canFetchPreview, accessToken }: LinkPreviewCardProps) {
  const preview = useLinkPreview(url, canFetchPreview, accessToken);

  if (!preview) {
    return (
      <a
        className={styles.linkChip}
        href={url}
        target="_blank"
        rel="noreferrer"
        data-testid="link-preview"
      >
        <LinkIcon size={18} aria-hidden="true" />
        <span>{url.replace(/^https?:\/\//i, '')}</span>
      </a>
    );
  }

  return (
    <article className={styles.card} data-testid="link-preview">
      <small className={styles.siteName}>{preview.siteName ?? preview.hostname}</small>
      {preview.title ? (
        <a className={styles.title} href={url} target="_blank" rel="noreferrer">
          {preview.title}
        </a>
      ) : null}
      {preview.description ? <p className={styles.description}>{preview.description}</p> : null}
    </article>
  );
}
