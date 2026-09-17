import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { messageReportReasons, SERVER_REPORT_DETAILS_MAX_LENGTH } from '@discord-clone/shared';
import type { DiscoveryServerCard, MessageReportReason } from '@/api';
import { Button, DialogContent, DialogRoot, TextArea } from '@/components/ui';
import { useReportServer } from '@/hooks/useServerDiscovery';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import styles from './Discovery.module.css';

interface ReportServerDialogProps {
  server: DiscoveryServerCard;
  onOpenChange: (open: boolean) => void;
}

/** "Report server" from a discovery card; needs no membership. */
export function ReportServerDialog({ server, onOpenChange }: ReportServerDialogProps) {
  const t = useTranslation();
  const report = useReportServer(server.id);
  const [reason, setReason] = useState<MessageReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || report.isPending) return;
    setError(null);
    try {
      await report.mutateAsync({ reason, details: details.trim() || undefined });
      setIsSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-report-server'));
    }
  }

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent
        title={t('discovery.report.title')}
        description={t('discovery.report.description', { name: server.name })}
      >
        {isSent ? (
          <div className={styles.reportForm}>
            <p className={styles.notice} role="status">
              {t('discovery.report.sent')}
            </p>
            <Button type="button" fullWidth onClick={() => onOpenChange(false)}>
              {t('report.done')}
            </Button>
          </div>
        ) : (
          <form className={styles.reportForm} onSubmit={(event) => void submit(event)}>
            <div className={styles.reasons} role="group" aria-label={t('report.reasonLabel')}>
              {messageReportReasons.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(styles.reason, reason === value && styles.selected)}
                  aria-pressed={reason === value}
                  onClick={() => setReason(value)}
                >
                  {t(`report.reason.${value}`)}
                </button>
              ))}
            </div>
            <TextArea
              label={t('report.detailsLabel')}
              value={details}
              maxLength={SERVER_REPORT_DETAILS_MAX_LENGTH}
              rows={3}
              placeholder={t('report.detailsPlaceholder')}
              onChange={(event) => setDetails(event.target.value)}
            />
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" fullWidth disabled={!reason || report.isPending}>
              {report.isPending ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
              {t('report.submit')}
            </Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
