import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { platformReportStatuses, type PlatformReportStatus } from '@discord-clone/shared';
import { Badge, Button, DialogContent, DialogRoot, TextField } from '@/components/ui';
import { usePlatformReportQueue } from '@/hooks/usePlatformReports';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { cn } from '@/utils/cn';
import { PlatformReportDetail } from './PlatformReportDetail';
import styles from './Platform.module.css';

interface PlatformReportsPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function statusVariant(status: string): 'danger' | 'neutral' | 'success' {
  if (status === 'OPEN') return 'danger';
  if (status === 'SERVER_DELISTED') return 'success';
  return 'neutral';
}

/** Admin-only queue for `ServerReport` rows filed from public discovery. */
export function PlatformReportsPage({ open, onOpenChange }: PlatformReportsPageProps) {
  const t = useTranslation();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.dialog}
        title={t('platform.title')}
        description={t('platform.description')}
      >
        {open ? <PlatformReportsBrowser /> : null}
      </DialogContent>
    </DialogRoot>
  );
}

function PlatformReportsBrowser() {
  const t = useTranslation();
  const dates = useDateFormat();
  const [status, setStatus] = useState<PlatformReportStatus>('OPEN');
  const [serverIdDraft, setServerIdDraft] = useState('');
  const [serverId, setServerId] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const queue = usePlatformReportQueue(status, serverId);

  if (selectedReportId) {
    return (
      <PlatformReportDetail reportId={selectedReportId} onBack={() => setSelectedReportId(null)} />
    );
  }

  return (
    <div className={styles.browser}>
      <div className={styles.tabs} role="group" aria-label={t('platform.statusFilter')}>
        {platformReportStatuses.map((value) => (
          <button
            key={value}
            type="button"
            className={cn(styles.tab, status === value && styles.selected)}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {t(`platform.status.${value}`)}
          </button>
        ))}
      </div>
      <form
        className={styles.filterRow}
        onSubmit={(event) => {
          event.preventDefault();
          setServerId(serverIdDraft.trim());
        }}
      >
        <TextField
          aria-label={t('platform.filter.serverIdLabel')}
          placeholder={t('platform.filter.serverIdPlaceholder')}
          value={serverIdDraft}
          onChange={(event) => setServerIdDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('platform.filter.apply')}
        </Button>
      </form>
      <div className={styles.results}>
        {queue.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('platform.loading')}
          </p>
        ) : queue.error ? (
          <p className="empty-note" role="alert">
            {queue.error instanceof Error ? queue.error.message : t('platform.error.load')}
          </p>
        ) : queue.reports.length ? (
          queue.reports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={styles.row}
              onClick={() => setSelectedReportId(report.id)}
            >
              <div className={styles.rowBody}>
                <strong>{t(`report.reason.${report.reason}`)}</strong>
                <small>
                  {t('reports.reportedBy', {
                    actor: report.reporter.displayName,
                    date: dates.absolute(report.createdAt),
                  })}
                </small>
              </div>
              <Badge variant={statusVariant(report.status)}>
                {t(`platform.status.${report.status}`)}
              </Badge>
            </button>
          ))
        ) : (
          <p className="empty-note">{t('platform.empty')}</p>
        )}
        {queue.hasNextPage ? (
          <Button
            variant="secondary"
            fullWidth
            disabled={queue.isFetchingNextPage}
            onClick={() => void queue.fetchNextPage()}
          >
            {queue.isFetchingNextPage ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : null}
            {t('platform.loadMore')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
