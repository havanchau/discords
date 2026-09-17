import { Loader2 } from 'lucide-react';
import { Button, DialogContent, DialogRoot } from '@/components/ui';
import type { ScheduledMessagesState } from '@/hooks/useScheduledMessages';
import { useTranslation } from '@/i18n/LocaleProvider';
import { ScheduledMessageItem } from './ScheduledMessageItem';
import styles from './ScheduledMessages.module.css';

interface ScheduledMessagesDialogProps {
  open: boolean;
  scheduled: ScheduledMessagesState;
  onOpenChange: (open: boolean) => void;
}

export function ScheduledMessagesDialog({
  open,
  scheduled,
  onOpenChange,
}: ScheduledMessagesDialogProps) {
  const t = useTranslation();
  const { pending, failed, isLoading, error, refetch } = scheduled;

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('scheduled.dialog.title')}
        description={t('scheduled.dialog.description')}
      >
        <div className={styles.dialogBody}>
          {error ? (
            <div className={styles.stateRow} role="alert">
              <span>
                {error instanceof Error
                  ? error.message
                  : t('error.fallback.cannot-load-scheduled-messages')}
              </span>
              <Button size="sm" variant="secondary" onClick={() => void refetch()}>
                {t('scheduled.action.retry')}
              </Button>
            </div>
          ) : null}
          {isLoading ? (
            <p className="empty-note" role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
              {t('scheduled.dialog.loading')}
            </p>
          ) : !pending.length && !failed.length ? (
            <p className="empty-note">{t('scheduled.dialog.empty')}</p>
          ) : (
            <>
              {pending.length ? (
                <section className={styles.section} aria-label={t('scheduled.dialog.pending')}>
                  <h3 className={styles.sectionTitle}>{t('scheduled.dialog.pending')}</h3>
                  <ul className={styles.list}>
                    {pending.map((item) => (
                      <ScheduledMessageItem key={item.id} item={item} scheduled={scheduled} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {failed.length ? (
                <section className={styles.section} aria-label={t('scheduled.dialog.failed')}>
                  <h3 className={styles.sectionTitle}>{t('scheduled.dialog.failed')}</h3>
                  <ul className={styles.list}>
                    {failed.map((item) => (
                      <ScheduledMessageItem key={item.id} item={item} scheduled={scheduled} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
