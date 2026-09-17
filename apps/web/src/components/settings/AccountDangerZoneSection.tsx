import { useState, type FormEvent } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { Banner, Button, TextField } from '@/components/ui';
import styles from '@/components/SettingsModal.module.css';
import { formText } from '@/utils/formText';

interface AccountDangerZoneSectionProps {
  accessToken: string;
  signOut: () => void;
}

/** "Delete my account": password plus a 2FA code when enabled, confirmed, then signed out. */
export function AccountDangerZoneSection({ accessToken, signOut }: AccountDangerZoneSectionProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const deletion = useAccountDeletion(accessToken);
  const [showForm, setShowForm] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void deletion.requestDeletion(formText(form, 'password'), formText(form, 'code').trim());
  }

  return (
    <section className={styles.settingsSection} aria-labelledby="account-delete-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="account-delete-title">
          <TriangleAlert size={14} aria-hidden="true" /> {t('account.delete.title')}
        </strong>
        <span>{t('account.delete.hint')}</span>
      </div>

      {deletion.scheduledAt ? (
        <>
          <Banner variant="info">
            {t('account.delete.scheduled', { date: dates.absolute(deletion.scheduledAt) })}
          </Banner>
          <Button type="button" onClick={signOut}>
            {t('account.delete.action.signOut')}
          </Button>
        </>
      ) : showForm ? (
        <form className={styles.settingsForm} onSubmit={submit}>
          <Banner variant="danger">{t('account.delete.warning')}</Banner>
          {deletion.error ? (
            <p className="empty-note" role="alert">
              {deletion.error}
            </p>
          ) : null}
          <TextField
            name="password"
            type="password"
            label={t('account.field.currentPassword')}
            required
            autoComplete="current-password"
            hint={t('account.field.oauthPasswordHint')}
          />
          <TextField
            name="code"
            label={t('account.delete.field.code')}
            maxLength={9}
            pattern="\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}"
            autoComplete="one-time-code"
            hint={t('account.delete.field.codeHint')}
          />
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" disabled={deletion.isBusy}>
              {deletion.isBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
              {t('account.delete.action.confirm')}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="danger" onClick={() => setShowForm(true)}>
          {t('account.delete.action.start')}
        </Button>
      )}
    </section>
  );
}
