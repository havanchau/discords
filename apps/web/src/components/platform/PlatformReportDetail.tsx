import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { PlatformReportResolution } from '@/api';
import { Badge, Button, TextArea } from '@/components/ui';
import { usePlatformReportDetail, useResolvePlatformReport } from '@/hooks/usePlatformReports';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import styles from './Platform.module.css';

interface PlatformReportDetailProps {
  reportId: string;
  onBack: () => void;
}

function statusVariant(status: string): 'danger' | 'neutral' | 'success' {
  if (status === 'OPEN') return 'danger';
  if (status === 'SERVER_DELISTED') return 'success';
  return 'neutral';
}

/** One report's full detail: the reported server's summary, plus dismiss/delist actions. */
export function PlatformReportDetail({ reportId, onBack }: PlatformReportDetailProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { detail, isLoading, error } = usePlatformReportDetail(reportId);
  const resolve = useResolvePlatformReport();
  const [confirming, setConfirming] = useState<PlatformReportResolution | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function submitResolution(resolution: PlatformReportResolution) {
    setActionError(null);
    try {
      await resolve.mutateAsync({ reportId, resolution, note: note.trim() || undefined });
      setConfirming(null);
      setNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.fallback.cannot-update-report'));
    }
  }

  return (
    <div className={styles.detail}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className={styles.backButton}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {t('platform.back')}
      </Button>

      {isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('platform.detail.loading')}
        </p>
      ) : error || !detail ? (
        <p className="empty-note" role="alert">
          {error instanceof Error ? error.message : t('platform.detail.notFound')}
        </p>
      ) : (
        <>
          <section className={styles.detailSection}>
            <div className={styles.detailHeading}>
              <strong>{t(`report.reason.${detail.report.reason}`)}</strong>
              <Badge variant={statusVariant(detail.report.status)}>
                {t(`platform.status.${detail.report.status}`)}
              </Badge>
            </div>
            {detail.report.details ? <p>{detail.report.details}</p> : null}
            <small>
              {t('reports.reportedBy', {
                actor: detail.report.reporter.displayName,
                date: dates.absolute(detail.report.createdAt),
              })}
            </small>
            {detail.report.resolvedAt && detail.report.resolvedBy ? (
              <small>
                {t('reports.resolvedBy', {
                  actor: detail.report.resolvedBy.displayName,
                  date: dates.absolute(detail.report.resolvedAt),
                })}
              </small>
            ) : null}
            {detail.report.resolutionNote ? <p>{detail.report.resolutionNote}</p> : null}
          </section>

          <section className={styles.detailSection}>
            <strong>{t('platform.server.title')}</strong>
            <div className={styles.serverSummary}>
              <strong>{detail.server.name}</strong>
              {detail.server.description ? <p>{detail.server.description}</p> : null}
              {detail.server.tags.length ? (
                <div className={styles.tags}>
                  {detail.server.tags.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <small>
                {t('platform.server.memberCount', { count: detail.server.memberCount })}
              </small>
              <small>{t('platform.server.owner', { name: detail.server.ownerDisplayName })}</small>
              <small>
                {detail.server.listed
                  ? t('platform.server.listed')
                  : t('platform.server.notListed')}
              </small>
            </div>
          </section>

          {actionError ? (
            <p className="empty-note" role="alert">
              {actionError}
            </p>
          ) : null}

          {detail.report.status === 'OPEN' ? (
            <div className={styles.actions}>
              {confirming ? (
                <div className={styles.confirmForm}>
                  <TextArea
                    label={t('platform.noteLabel')}
                    value={note}
                    maxLength={500}
                    rows={2}
                    placeholder={t('platform.notePlaceholder')}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <div className={styles.confirmButtons}>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={resolve.isPending}
                      onClick={() => void submitResolution(confirming)}
                    >
                      {resolve.isPending ? (
                        <Loader2 className="spin" size={16} aria-hidden="true" />
                      ) : null}
                      {confirming === 'DISMISSED'
                        ? t('platform.action.confirmDismiss')
                        : t('platform.action.confirmDelist')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setConfirming(null);
                        setNote('');
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirming('DISMISSED')}
                  >
                    {t('platform.action.dismiss')}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirming('SERVER_DELISTED')}
                  >
                    {t('platform.action.delist')}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
