import { Loader2, Pin } from 'lucide-react';
import type { DirectMessage } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { IconButton, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui';
import styles from './HomePanel.module.css';

type DirectPinnedMessagesProps = {
  pinnedMessages: DirectMessage[];
  isLoading: boolean;
  error: string | null;
  onOpen: () => void;
  onJumpToMessage: (messageId: string) => void;
};

export function DirectPinnedMessages({
  pinnedMessages,
  isLoading,
  error,
  onOpen,
  onJumpToMessage,
}: DirectPinnedMessagesProps) {
  const t = useTranslation();
  const dates = useDateFormat();

  return (
    <PopoverRoot onOpenChange={(open) => open && onOpen()}>
      <PopoverTrigger asChild>
        <IconButton label={t('pinned.title')}>
          <Pin size={18} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom">
        <div className={styles.pinnedPanel} aria-label={t('pinned.title')}>
          <strong className={styles.pinnedTitle}>{t('pinned.title')}</strong>
          {isLoading ? (
            <p className={styles.pinnedState} role="status">
              <Loader2 className="spin" size={16} aria-hidden="true" /> {t('pinned.loading')}
            </p>
          ) : error ? (
            <p className={styles.pinnedState} role="alert">
              {error}
            </p>
          ) : pinnedMessages.length ? (
            <ul className={styles.pinnedList}>
              {pinnedMessages.map((message) => (
                <li key={message.id}>
                  <button type="button" onClick={() => onJumpToMessage(message.id)}>
                    <strong>{message.author?.displayName ?? t('message.fallbackAuthor')}</strong>
                    <small>{dates.dateTime(message.createdAt)}</small>
                    <span>{message.content}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.pinnedState}>{t('pinned.empty')}</p>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
