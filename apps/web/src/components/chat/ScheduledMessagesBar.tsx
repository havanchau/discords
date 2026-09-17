import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui';
import { useScheduledMessages, type ScheduledDestination } from '@/hooks/useScheduledMessages';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { ScheduledMessagesDialog } from './ScheduledMessagesDialog';
import styles from './ScheduledMessages.module.css';

interface ScheduledMessagesBarProps {
  destination: ScheduledDestination;
  className?: string;
}

/** "Scheduled (n)" above a composer, shown once the destination has pending or failed messages. */
export function ScheduledMessagesBar({ destination, className }: ScheduledMessagesBarProps) {
  const t = useTranslation();
  const scheduled = useScheduledMessages(destination);
  const [isOpen, setIsOpen] = useState(false);
  const { pending, failed } = scheduled;

  if (!pending.length && !failed.length && !isOpen) return null;

  return (
    <div className={cn(styles.bar, className)}>
      <CalendarClock size={14} aria-hidden="true" />
      <span className={styles.barText}>
        {t('scheduled.bar.pending', { count: pending.length })}
        {failed.length ? (
          <span className={styles.barFailed}>
            {t('scheduled.bar.failed', { count: failed.length })}
          </span>
        ) : null}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setIsOpen(true)}>
        {t('scheduled.bar.open')}
      </Button>
      <ScheduledMessagesDialog open={isOpen} scheduled={scheduled} onOpenChange={setIsOpen} />
    </div>
  );
}
