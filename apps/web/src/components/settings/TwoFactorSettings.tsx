import { useState, type FormEvent } from 'react';
import { Clipboard, Loader2, ShieldCheck } from 'lucide-react';
import { useTwoFactor } from '../../hooks/useTwoFactor';
import { Badge, Button, TextField } from '../ui';
import styles from '../SettingsModal.module.css';

interface TwoFactorSettingsProps {
  accessToken: string;
}

function formValue(event: FormEvent<HTMLFormElement>, name: string) {
  return String(new FormData(event.currentTarget).get(name) ?? '').trim();
}

export function TwoFactorSettings({ accessToken }: TwoFactorSettingsProps) {
  const twoFactor = useTwoFactor(accessToken);
  const [showDisable, setShowDisable] = useState(false);
  const { status, setup, recoveryCodes, error, isBusy } = twoFactor;

  return (
    <section className={styles.settingsSection} aria-labelledby="two-factor-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="two-factor-title">
          <ShieldCheck size={14} aria-hidden="true" /> Two-factor authentication{' '}
          {status?.enabled ? <Badge variant="success">Enabled</Badge> : null}
        </strong>
        <span>Require a code from an authenticator app when signing in.</span>
      </div>

      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}

      {!status ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> Loading security settings
        </p>
      ) : null}

      {recoveryCodes ? (
        <div className={styles.recoveryCodes} role="status">
          <strong>Save these recovery codes now. They will not be shown again.</strong>
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
              Copy codes
            </Button>
            <Button type="button" size="sm" onClick={twoFactor.dismissRecoveryCodes}>
              I saved them
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
          Enable two-factor authentication
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
            Add this key to your authenticator app, or open the setup link on this device.
          </p>
          <div className={styles.inviteRow}>
            <div>
              <strong>
                <code>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
              </strong>
            </div>
            <a href={setup.otpauthUrl}>Open in authenticator</a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(setup.secret)}
            >
              <Clipboard size={14} aria-hidden="true" />
              Copy
            </Button>
          </div>
          <TextField
            name="code"
            label="6-digit code"
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <div className={styles.settingsModalFooter}>
            <Button type="button" variant="ghost" onClick={twoFactor.cancelSetup}>
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              Confirm and enable
            </Button>
          </div>
        </form>
      ) : null}

      {status?.enabled ? (
        <>
          <p className="empty-note">
            {status.recoveryCodesRemaining} recovery code
            {status.recoveryCodesRemaining === 1 ? '' : 's'} left.
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
              label="Authenticator code"
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <Button type="submit" variant="secondary" disabled={isBusy}>
              New recovery codes
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
                label="Current password"
                required
                autoComplete="current-password"
                hint="Signed up with Google or Facebook? Set a password with “Forgot password?” on the sign-in screen first."
              />
              <TextField
                name="code"
                label="Authenticator or recovery code"
                required
                maxLength={9}
                autoComplete="one-time-code"
              />
              <div className={styles.settingsModalFooter}>
                <Button type="button" variant="ghost" onClick={() => setShowDisable(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger" disabled={isBusy}>
                  Disable two-factor
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setShowDisable(true)}>
              Disable two-factor authentication
            </Button>
          )}
        </>
      ) : null}
    </section>
  );
}
