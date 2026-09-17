import { useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { reminderInputToIso } from '@/components/saved/ReminderPicker';
import { Button, IconButton, PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui';
import { useScheduledMessages, type ScheduledDestination } from '@/hooks/useScheduledMessages';
import { useTranslation } from '@/i18n/LocaleProvider';
import { parseSlashCommand } from '@/utils/slashCommands';
import { SendAtField } from './SendAtField';
import styles from './ScheduledMessages.module.css';

interface ScheduleSendButtonProps {
  destination: ScheduledDestination;
  draft: string;
  files: File[];
  replyToMessageId?: string;
  disabled?: boolean;
  className?: string;
  /** Clears the draft, files and reply once the message is scheduled. */
  onScheduled: () => void;
}

/** "Schedule message" next to the composer's send button: sends the current draft at a chosen time. */
export function ScheduleSendButton({
  destination,
  draft,
  files,
  replyToMessageId,
  disabled,
  className,
  onScheduled,
}: ScheduleSendButtonProps) {
  const t = useTranslation();
  const { schedule, isScheduling } = useScheduledMessages(destination);
  const [isOpen, setIsOpen] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const content = draft.trim();
  const isCommand = parseSlashCommand(content).isCommand;
  const hasContent = Boolean(content) || files.length > 0;

  function setOpen(open: boolean) {
    setIsOpen(open);
    if (open) setError(null);
  }

  async function submit() {
    const sendAtIso = reminderInputToIso(sendAt);
    if (!sendAtIso) {
      setError(t('scheduled.error.noTime'));
      return;
    }
    setError(null);
    try {
      await schedule({ content, files, replyToMessageId, sendAt: sendAtIso });
      setSendAt('');
      setIsOpen(false);
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-schedule-message'));
    }
  }

  const label = t('scheduled.action.open');

  return (
    <PopoverRoot open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={label} className={className} disabled={disabled}>
          <CalendarClock size={18} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className={styles.popover}>
        <strong className={styles.popoverTitle}>{label}</strong>
        {isCommand ? (
          <p className={styles.note}>{t('scheduled.error.slashCommand')}</p>
        ) : !hasContent ? (
          <p className={styles.note}>{t('scheduled.error.empty')}</p>
        ) : (
          <>
            <p className={styles.note}>{t('scheduled.popover.hint')}</p>
            <SendAtField value={sendAt} onChange={setSendAt} disabled={isScheduling} />
          </>
        )}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button
            size="sm"
            disabled={isScheduling || isCommand || !hasContent || !sendAt}
            onClick={() => void submit()}
          >
            {isScheduling ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
            {t('scheduled.action.schedule')}
          </Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
