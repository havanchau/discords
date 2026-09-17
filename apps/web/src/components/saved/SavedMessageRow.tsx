import { BellRing, ExternalLink, Trash2 } from 'lucide-react';
import { assetUrl, type SavedMessage } from '@/api';
import { initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { Avatar, Button, IconButton, Tooltip } from '@/components/ui';
import styles from './SavedMessageRow.module.css';

interface SavedMessageRowProps {
  savedMessage: SavedMessage;
  /** Channel or conversation label, already resolved by the list. */
  sourceLabel: string;
  isRemoving: boolean;
  onJump: (savedMessage: SavedMessage) => void;
  onRemove: (savedMessageId: string) => void;
}

export function SavedMessageRow({
  savedMessage,
  sourceLabel,
  isRemoving,
  onJump,
  onRemove,
}: SavedMessageRowProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const author = savedMessage.snapshotAuthor;

  return (
    <li className={styles.row}>
      <Avatar
        size="sm"
        src={author.avatarUrl ? assetUrl(author.avatarUrl) : null}
        alt={author.displayName}
        fallback={initials(author.displayName)}
      />
      <div className={styles.body}>
        <div className={styles.meta}>
          <strong>{author.displayName}</strong>
          <span>{sourceLabel}</span>
          <time dateTime={savedMessage.createdAt}>
            {t('saved.savedAt', { date: dates.dateTime(savedMessage.createdAt) })}
          </time>
        </div>
        <p className={styles.content}>{savedMessage.snapshotContent || t('saved.noText')}</p>
        {savedMessage.remindAt ? (
          <p className={styles.reminder}>
            <BellRing size={12} aria-hidden="true" />
            {savedMessage.remindedAt
              ? t('saved.reminder.sent', { date: dates.dateTime(savedMessage.remindedAt) })
              : t('saved.reminder.pending', { date: dates.dateTime(savedMessage.remindAt) })}
          </p>
        ) : null}
        {savedMessage.isAccessible ? null : (
          <p className={styles.unavailable}>{t('saved.unavailable')}</p>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          disabled={!savedMessage.isAccessible}
          onClick={() => onJump(savedMessage)}
        >
          <ExternalLink size={14} aria-hidden="true" />
          {t('saved.action.jump')}
        </Button>
        <Tooltip content={t('saved.action.remove')}>
          <IconButton
            label={t('saved.action.remove')}
            size="sm"
            variant="danger"
            disabled={isRemoving}
            onClick={() => onRemove(savedMessage.id)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </div>
    </li>
  );
}
