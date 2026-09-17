import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { ScheduledMessage } from '@/api';
import { reminderInputToIso, reminderIsoToInput } from '@/components/saved/ReminderPicker';
import { Button, TextArea } from '@/components/ui';
import type { ScheduledMessagesState } from '@/hooks/useScheduledMessages';
import type { MessageKey } from '@/i18n/LocaleProvider';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { SendAtField } from './SendAtField';
import styles from './ScheduledMessages.module.css';

const FAILURE_REASON_KEYS: Record<NonNullable<ScheduledMessage['failureReason']>, MessageKey> = {
  NO_ACCESS: 'scheduled.failure.NO_ACCESS',
  MISSING_PERMISSION: 'scheduled.failure.MISSING_PERMISSION',
  TIMED_OUT: 'scheduled.failure.TIMED_OUT',
  SLOWMODE: 'scheduled.failure.SLOWMODE',
  BLOCKED: 'scheduled.failure.BLOCKED',
  REPLY_TARGET_MISSING: 'scheduled.failure.REPLY_TARGET_MISSING',
  REJECTED: 'scheduled.failure.REJECTED',
  INTERRUPTED: 'scheduled.failure.INTERRUPTED',
  AUTOMOD_BLOCKED: 'scheduled.failure.AUTOMOD_BLOCKED',
  ACCOUNT_DELETION: 'scheduled.failure.ACCOUNT_DELETION',
  RULES_NOT_ACCEPTED: 'scheduled.failure.RULES_NOT_ACCEPTED',
  UNKNOWN: 'scheduled.failure.UNKNOWN',
};

interface ScheduledMessageItemProps {
  item: ScheduledMessage;
  scheduled: ScheduledMessagesState;
}

/** One pending or failed scheduled message, with inline edit (reschedule for a failed one). */
export function ScheduledMessageItem({ item, scheduled }: ScheduledMessageItemProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(item.content);
  const [sendAt, setSendAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFailed = item.status === 'FAILED';
  const { isMutating } = scheduled;

  function startEditing() {
    setContent(item.content);
    // A failed message's time has passed, so rescheduling starts from an empty time.
    setSendAt(isFailed ? '' : reminderIsoToInput(item.sendAt));
    setError(null);
    setIsEditing(true);
  }

  async function save() {
    const sendAtIso = reminderInputToIso(sendAt);
    if (!sendAtIso) {
      setError(t('scheduled.error.noTime'));
      return;
    }
    setError(null);
    try {
      await scheduled.update({ id: item.id, input: { content, sendAt: sendAtIso } });
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-scheduled-message'),
      );
    }
  }

  async function remove() {
    setError(null);
    try {
      await scheduled.remove(item.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('error.fallback.cannot-cancel-scheduled-message'),
      );
    }
  }

  return (
    <li className={styles.item}>
      {isEditing ? (
        <div className={styles.editForm}>
          <TextArea
            label={t('scheduled.field.content')}
            value={content}
            maxLength={4000}
            rows={3}
            disabled={isMutating}
            onChange={(event) => setContent(event.target.value)}
          />
          <SendAtField value={sendAt} onChange={setSendAt} disabled={isMutating} />
        </div>
      ) : (
        <>
          <p className={styles.itemContent}>{item.content || t('scheduled.item.noText')}</p>
          <div className={styles.itemMeta}>
            <time dateTime={item.sendAt}>
              {t(isFailed ? 'scheduled.item.wasDue' : 'scheduled.item.sendsAt', {
                date: dates.dateTime(item.sendAt),
              })}
            </time>
            {item.attachments.length ? (
              <span className={styles.itemAttachments}>
                <Paperclip size={12} aria-hidden="true" />
                {t('scheduled.item.attachments', { count: item.attachments.length })}
              </span>
            ) : null}
          </div>
          {isFailed ? (
            <p className={styles.error}>
              {t(FAILURE_REASON_KEYS[item.failureReason ?? 'UNKNOWN'])}
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        {isEditing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={isMutating}
              onClick={() => setIsEditing(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button size="sm" disabled={isMutating || !sendAt} onClick={() => void save()}>
              {isFailed ? t('scheduled.action.reschedule') : t('common.save')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="danger" disabled={isMutating} onClick={() => void remove()}>
              {isFailed ? t('common.dismiss') : t('scheduled.action.cancel')}
            </Button>
            <Button size="sm" variant="secondary" disabled={isMutating} onClick={startEditing}>
              {isFailed ? t('scheduled.action.reschedule') : t('scheduled.action.edit')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
