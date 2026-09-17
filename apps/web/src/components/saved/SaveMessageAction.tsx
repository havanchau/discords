import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { SavedMessage } from '@/api';
import { savedMessageKey, useSavedMessages } from '@/hooks/useSavedMessages';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import {
  Button,
  IconButton,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui';
import { ReminderPicker, reminderInputToIso, reminderIsoToInput } from './ReminderPicker';
import styles from './SaveMessageAction.module.css';

interface SaveMessageActionProps {
  sourceType: SavedMessage['sourceType'];
  messageId: string;
  size?: 'sm' | 'md';
  /** Lets the row keep its hover actions mounted while the popover is open. */
  onOpenChange?: (open: boolean) => void;
}

/** "Save message" in a message's action bar, with an optional reminder. */
export function SaveMessageAction({
  sourceType,
  messageId,
  size,
  onOpenChange,
}: SaveMessageActionProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { bySourceMessage, save, remove, isMutating } = useSavedMessages();
  const saved = bySourceMessage.get(savedMessageKey(sourceType, messageId));
  const [isOpen, setIsOpen] = useState(false);
  const [reminder, setReminder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const label = saved ? t('saved.action.saved') : t('saved.action.save');

  function setOpen(open: boolean) {
    setIsOpen(open);
    onOpenChange?.(open);
    if (open) {
      setReminder(saved?.remindedAt ? '' : reminderIsoToInput(saved?.remindAt ?? null));
      setError(null);
    }
  }

  async function submit() {
    setError(null);
    try {
      await save({ sourceType, messageId, remindAt: reminderInputToIso(reminder) });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-save-message'));
    }
  }

  async function unsave(savedMessageId: string) {
    setError(null);
    try {
      await remove(savedMessageId);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-remove-saved-message'),
      );
    }
  }

  return (
    <PopoverRoot open={isOpen} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <IconButton label={label} size={size} aria-pressed={Boolean(saved)}>
            {saved ? (
              <BookmarkCheck size={14} aria-hidden="true" />
            ) : (
              <Bookmark size={14} aria-hidden="true" />
            )}
          </IconButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="end" className={styles.popover}>
        <strong className={styles.title}>{label}</strong>
        {saved?.remindedAt ? (
          <p className={styles.note}>
            {t('saved.reminder.sent', { date: dates.dateTime(saved.remindedAt) })}
          </p>
        ) : (
          <ReminderPicker value={reminder} onChange={setReminder} disabled={isMutating} />
        )}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {saved ? (
            <>
              <Button
                size="sm"
                variant="danger"
                disabled={isMutating}
                onClick={() => void unsave(saved.id)}
              >
                {t('saved.action.remove')}
              </Button>
              {saved.remindedAt ? null : (
                <Button size="sm" disabled={isMutating || !reminder} onClick={() => void submit()}>
                  {t('saved.action.updateReminder')}
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" disabled={isMutating} onClick={() => void submit()}>
              {t('saved.action.save')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
