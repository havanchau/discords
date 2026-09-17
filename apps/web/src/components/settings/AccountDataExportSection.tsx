import { useState, type FormEvent } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { AuthState, ExportJob } from '@/api';
import { useAccountExport } from '@/hooks/useAccountExport';
import { useTranslation, type Translate } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { Badge, Button, TextField } from '@/components/ui';
import styles from '@/components/SettingsModal.module.css';
import { formText } from '@/utils/formText';

interface AccountDataExportSectionProps {
  auth: AuthState;
}

/** "Download my data": password, then Preparing / Ready with a download / Failed with retry. */
export function AccountDataExportSection({ auth }: AccountDataExportSectionProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const exports = useAccountExport(auth);
  const [showForm, setShowForm] = useState(false);
  const { job } = exports;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const requested = await exports.requestExport(formText(new FormData(form), 'password'));
    if (requested) setShowForm(false);
  }

  return (
    <section className={styles.settingsSection} aria-labelledby="account-export-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="account-export-title">
          <Download size={14} aria-hidden="true" /> {t('account.export.title')}
        </strong>
        <span>{t('account.export.hint')}</span>
      </div>

      {exports.error || exports.loadError ? (
        <p className="empty-note" role="alert">
          {exports.error ?? exports.loadError}
        </p>
      ) : null}

      {exports.isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('account.export.loading')}
        </p>
      ) : null}

      {job ? (
        <div className={styles.inviteRow} role="status">
          <div>
            <strong>
              <ExportStatusBadge job={job} />
            </strong>
            <small>{describeJob(job, t, dates.absolute)}</small>
          </div>
          <span />
          {job.downloadUrl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={exports.isDownloading}
              onClick={() => void exports.downloadExport(job)}
            >
              {t('account.export.action.download')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <form className={styles.settingsForm} onSubmit={(event) => void submit(event)}>
          <TextField
            name="password"
            type="password"
            label={t('account.field.currentPassword')}
            required
            autoComplete="current-password"
            hint={t('account.field.oauthPasswordHint')}
          />
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={exports.isRequesting}>
              {exports.isRequesting ? (
                <Loader2 className="spin" size={14} aria-hidden="true" />
              ) : null}
              {t('account.export.action.request')}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={job?.status === 'PENDING'}
          onClick={() => setShowForm(true)}
        >
          {job?.status === 'FAILED'
            ? t('account.export.action.retry')
            : t('account.export.action.start')}
        </Button>
      )}
    </section>
  );
}

function ExportStatusBadge({ job }: { job: ExportJob }) {
  const t = useTranslation();
  if (job.status === 'PENDING')
    return <Badge variant="neutral">{t('account.export.status.pending')}</Badge>;
  if (job.status === 'FAILED')
    return <Badge variant="danger">{t('account.export.status.failed')}</Badge>;
  return job.downloadUrl ? (
    <Badge variant="success">{t('account.export.status.ready')}</Badge>
  ) : (
    <Badge variant="neutral">{t('account.export.status.expired')}</Badge>
  );
}

function describeJob(job: ExportJob, t: Translate, absolute: (value: string) => string) {
  if (job.status === 'READY' && job.downloadUrl && job.expiresAt) {
    return t('account.export.availableUntil', { date: absolute(job.expiresAt) });
  }
  return t('account.export.requestedAt', { date: absolute(job.createdAt) });
}
