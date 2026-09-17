import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { messageReportReasons } from '@discord-clone/shared';
import type { MessageReportReason } from '@/api';
import { useCreateMessageReport } from '@/hooks/useMessageReports';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { Button, DialogContent, DialogRoot, TextArea } from '@/components/ui';
import styles from './ReportMessageDialog.module.css';

const MAX_DETAILS_LENGTH = 500;

interface ReportMessageDialogProps {
  serverId: string;
  messageId: string;
  onOpenChange: (open: boolean) => void;
}

/** "Report message": sends a reason and optional details to the server's moderators. */
export function ReportMessageDialog({
  serverId,
  messageId,
  onOpenChange,
}: ReportMessageDialogProps) {
  const t = useTranslation();
  const report = useCreateMessageReport(serverId);
  const [reason, setReason] = useState<MessageReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'created' | 'alreadyOpen' | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || report.isPending) return;
    setError(null);
    try {
      const result = await report.mutateAsync({
        targetType: 'MESSAGE',
        messageId,
        reason,
        details: details.trim() || undefined,
      });
      setOutcome(result.created ? 'created' : 'alreadyOpen');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-report-message'));
    }
  }

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent title={t('report.title')} description={t('report.description')}>
        {outcome ? (
          <div className={styles.form}>
            <p className={styles.notice} role="status">
              {outcome === 'created' ? t('report.sent') : t('report.alreadyOpen')}
            </p>
            <Button type="button" fullWidth onClick={() => onOpenChange(false)}>
              {t('report.done')}
            </Button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
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
              maxLength={MAX_DETAILS_LENGTH}
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
