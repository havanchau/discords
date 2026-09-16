import { useState, type FormEvent } from 'react';
import { Clipboard, Loader2, ShieldCheck } from 'lucide-react';
import { useTwoFactor } from '../../hooks/useTwoFactor';
import { useTranslation } from '../../i18n/LocaleProvider';
import { Badge, Button, TextField } from '../ui';
import styles from '../SettingsModal.module.css';

interface TwoFactorSettingsProps {
  accessToken: string;
}

function formValue(event: FormEvent<HTMLFormElement>, name: string) {
  return String(new FormData(event.currentTarget).get(name) ?? '').trim();
}

export function TwoFactorSettings({ accessToken }: TwoFactorSettingsProps) {
  const t = useTranslation();
  const twoFactor = useTwoFactor(accessToken);
  const [showDisable, setShowDisable] = useState(false);
  const { status, setup, recoveryCodes, error, isBusy } = twoFactor;

  return (
    <section className={styles.settingsSection} aria-labelledby="two-factor-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="two-factor-title">
          <ShieldCheck size={14} aria-hidden="true" /> {t('twoFactor.title')}{' '}
          {status?.enabled ? <Badge variant="success">{t('twoFactor.enabled')}</Badge> : null}
        </strong>
        <span>{t('twoFactor.hint')}</span>
      </div>

      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}

      {!status ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('twoFactor.loading')}
        </p>
      ) : null}

      {recoveryCodes ? (
        <div className={styles.recoveryCodes} role="status">
          <strong>{t('twoFactor.recovery.warning')}</strong>
          <ul>
            {recoveryCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <div className={styles.settingsModalFooter}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join('\n'))}
            >
              <Clipboard size={14} aria-hidden="true" />
              {t('twoFactor.recovery.copy')}
            </Button>
            <Button type="button" size="sm" onClick={twoFactor.dismissRecoveryCodes}>
              {t('twoFactor.recovery.saved')}
            </Button>
          </div>
        </div>
      ) : null}

      {status && !status.enabled && !setup ? (
        <Button
          type="button"
          variant="secondary"
          disabled={isBusy}
          onClick={() => void twoFactor.startSetup()}
        >
          {t('twoFactor.action.enable')}
        </Button>
      ) : null}

      {setup ? (
        <form
          className={styles.settingsForm}
          onSubmit={(event) => {
            event.preventDefault();
            void twoFactor.confirmSetup(formValue(event, 'code'));
          }}
        >
          <p className="empty-note">
            {t('twoFactor.setup.hint')}
          </p>
          <div className={styles.inviteRow}>
            <div>
              <strong>
                <code>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
              </strong>
            </div>
            <a href={setup.otpauthUrl}>{t('twoFactor.setup.openInApp')}</a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(setup.secret)}
            >
              <Clipboard size={14} aria-hidden="true" />
              {t('twoFactor.setup.copy')}
            </Button>
          </div>
          <TextField
            name="code"
            label={t('twoFactor.field.code6')}
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={twoFactor.cancelSetup}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isBusy}>
              {t('twoFactor.action.confirm')}
            </Button>
          </div>
        </form>
      ) : null}

      {status?.enabled ? (
        <>
          <p className="empty-note">
            {status.recoveryCodesRemaining === 1
              ? t('twoFactor.recovery.remainingOne')
              : t('twoFactor.recovery.remaining', { count: status.recoveryCodesRemaining })}
          </p>
          <form
            className={styles.moderationRow}
            onSubmit={(event) => {
              event.preventDefault();
              void twoFactor.regenerateRecoveryCodes(formValue(event, 'code'));
            }}
          >
            <TextField
              name="code"
              label={t('twoFactor.field.authenticatorCode')}
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <Button type="submit" variant="secondary" disabled={isBusy}>
              {t('twoFactor.action.newRecoveryCodes')}
            </Button>
          </form>

          {showDisable ? (
            <form
              className={styles.settingsForm}
              onSubmit={(event) => {
                event.preventDefault();
                const password = formValue(event, 'password');
                const code = formValue(event, 'code');
                void twoFactor.disable(password, code).then((disabled) => {
                  if (disabled) setShowDisable(false);
                });
              }}
            >
              <TextField
                name="password"
                type="password"
                label={t('twoFactor.field.currentPassword')}
                required
                autoComplete="current-password"
                hint={t('twoFactor.field.currentPasswordHint')}
              />
              <TextField
                name="code"
                label={t('twoFactor.field.anyCode')}
                required
                maxLength={9}
                autoComplete="one-time-code"
              />
              <div className={styles.settingsModalFooter}>
                <Button type="button" variant="ghost" onClick={() => setShowDisable(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="danger" disabled={isBusy}>
                  {t('twoFactor.action.disable')}
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setShowDisable(true)}>
              {t('twoFactor.action.disableLong')}
            </Button>
          )}
        </>
      ) : null}
    </section>
  );
}
