import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { messageReportStatuses } from '@discord-clone/shared';
import type { MessageReport, MessageReportStatus } from '@/api';
import { Button } from '@/components/ui';
import { isEncryptedMessage } from '@/e2ee';
import { useMessageReportQueue } from '@/hooks/useMessageReports';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { cn } from '@/utils/cn';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ReportsSection.module.css';

interface ReportsSectionProps {
  serverId: string;
}

/** The server's moderator queue. Rendered only for MANAGE_MESSAGES holders; the API re-checks. */
export function ReportsSection({ serverId }: ReportsSectionProps) {
  const t = useTranslation();
  const [status, setStatus] = useState<MessageReportStatus>('OPEN');
  const queue = useMessageReportQueue(serverId, status);
  const [actionError, setActionError] = useState<string | null>(null);

  async function close(reportId: string, nextStatus: 'RESOLVED' | 'DISMISSED') {
    setActionError(null);
    try {
      await queue.updateStatus({ reportId, status: nextStatus });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.fallback.cannot-update-report'));
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-reports-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-reports-title">{t('reports.section.title')}</strong>
        <span>{t('reports.section.hint')}</span>
      </div>
      <div className={styles.tabs} role="group" aria-label={t('reports.statusFilter')}>
        {messageReportStatuses.map((value) => (
          <button
            key={value}
            type="button"
            className={cn(styles.tab, status === value && styles.selected)}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {t(`reports.status.${value}`)}
          </button>
        ))}
      </div>
      {actionError ? (
        <p className="empty-note" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className={settingsStyles.inviteList}>
        {queue.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('reports.loading')}
          </p>
        ) : queue.error ? (
          <p className="empty-note" role="alert">
            {queue.error instanceof Error
              ? queue.error.message
              : t('error.fallback.cannot-load-reports')}
          </p>
        ) : queue.reports.length ? (
          queue.reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              isPending={queue.pendingReportId === report.id}
              onClose={(nextStatus) => void close(report.id, nextStatus)}
            />
          ))
        ) : (
          <p className="empty-note">{t(`reports.empty.${status}`)}</p>
        )}
      </div>
    </section>
  );
}

function ReportRow({
  report,
  isPending,
  onClose,
}: {
  report: MessageReport;
  isPending: boolean;
  onClose: (status: 'RESOLVED' | 'DISMISSED') => void;
}) {
  const t = useTranslation();
  const dates = useDateFormat();
  const target = report.targetUser?.displayName ?? t('reports.unknownUser');
  const preview = !report.message
    ? report.targetType === 'MESSAGE'
      ? t('reports.messageUnavailable')
      : null
    : report.message.contentHidden
      ? t('reports.messageHidden')
      : isEncryptedMessage(report.message.content)
        ? t('reports.messageEncrypted')
        : report.message.content;

  return (
    <div className={settingsStyles.inviteRow}>
      <div>
        <strong>
          {t(`report.reason.${report.reason}`)} · {target}
        </strong>
        {preview ? <small title={preview}>{preview}</small> : null}
        {report.details ? <small title={report.details}>{report.details}</small> : null}
        <small>
          {t('reports.reportedBy', {
            actor: report.reporter.displayName,
            date: dates.absolute(report.createdAt),
          })}
        </small>
        {report.resolvedAt ? (
          <small>
            {t(report.status === 'RESOLVED' ? 'reports.resolvedBy' : 'reports.dismissedBy', {
              actor: report.resolvedBy?.displayName ?? t('reports.unknownUser'),
              date: dates.absolute(report.resolvedAt),
            })}
          </small>
        ) : null}
      </div>
      {report.status === 'OPEN' ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => onClose('RESOLVED')}
          >
            {t('reports.action.resolve')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => onClose('DISMISSED')}
          >
            {t('reports.action.dismiss')}
          </Button>
        </>
      ) : (
        <>
          <span />
          <span />
        </>
      )}
    </div>
  );
}
