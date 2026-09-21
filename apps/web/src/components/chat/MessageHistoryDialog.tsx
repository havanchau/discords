import type { UseQueryResult } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { MessageHistory, MessageRevision } from '@/api';
import { DialogContent, DialogRoot } from '@/components/ui';
import { isEncryptedMessage } from '@/e2ee';
import { useMessageRevisions, useReportMessageRevisions } from '@/hooks/useMessageRevisions';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import styles from './MessageHistoryDialog.module.css';

interface DialogProps {
  onOpenChange: (open: boolean) => void;
}

/** "Edit history" from the author's own message. */
export function AuthorMessageHistoryDialog({
  messageId,
  onOpenChange,
}: DialogProps & { messageId: string }) {
  const history = useMessageRevisions(messageId);
  return <MessageHistoryDialog history={history} onOpenChange={onOpenChange} />;
}

/** "View edit history" from a MESSAGE report in the moderator queue. */
export function ReportMessageHistoryDialog({
  serverId,
  reportId,
  onOpenChange,
}: DialogProps & { serverId: string; reportId: string }) {
  const history = useReportMessageRevisions(serverId, reportId);
  return <MessageHistoryDialog history={history} onOpenChange={onOpenChange} />;
}

/** Read-only list of a message's earlier versions, oldest first, as plain text. */
function MessageHistoryDialog({
  history,
  onOpenChange,
}: DialogProps & { history: UseQueryResult<MessageHistory> }) {
  const t = useTranslation();

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent
        title={t('message.history.title')}
        description={t('message.history.description')}
      >
        {history.isPending ? (
          <p className={styles.notice} role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('message.history.loading')}
          </p>
        ) : history.isError ? (
          <p className={styles.error} role="alert">
            {history.error instanceof Error
              ? history.error.message
              : t('error.fallback.cannot-load-message-history')}
          </p>
        ) : history.data.revisions.length ? (
          <ol className={styles.list}>
            {history.data.revisions.map((revision) => (
              <RevisionItem key={revision.id} revision={revision} />
            ))}
          </ol>
        ) : (
          <p className={styles.notice}>{t('message.history.empty')}</p>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

function RevisionItem({ revision }: { revision: MessageRevision }) {
  const t = useTranslation();
  const dates = useDateFormat();
  // Ciphertext is never shown; the key that decrypts the live message is not applied to history.
  const placeholder = revision.contentHidden
    ? t('message.history.hidden')
    : isEncryptedMessage(revision.content)
      ? t('message.history.encrypted')
      : null;

  return (
    <li className={styles.item}>
      <small>{t('message.history.replacedAt', { date: dates.dateTime(revision.editedAt) })}</small>
      {placeholder ? (
        <p className={styles.placeholder}>{placeholder}</p>
      ) : (
        <p className={styles.content}>{revision.content}</p>
      )}
    </li>
  );
}
