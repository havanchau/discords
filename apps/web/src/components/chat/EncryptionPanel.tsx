import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { E2EE_UI_ENABLED } from '@/featureFlags';
import { useTranslation } from '@/i18n/LocaleProvider';
import { formText } from '@/utils/formText';
import { cn } from '@/utils/cn';
import { Button, TextField } from '@/components/ui';
import type { ChatPanelEncryption } from './types';
import styles from './EncryptionPanel.module.css';

interface EncryptionPanelProps {
  encryption: ChatPanelEncryption;
}

/**
 * Channel encryption controls. Turning it on needs no secret typed anywhere: the keys are made per
 * device. What it costs is listed before the action, because that is the moment to decide.
 */
export function EncryptionPanel({ encryption }: EncryptionPanelProps) {
  const t = useTranslation();
  const { isChannelEncrypted, deviceStatus, isUpdating } = encryption;

  function handleLegacySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const passphrase = formText(new FormData(formElement), 'passphrase');
    void encryption.unlockLegacyMessages(passphrase).then(() => formElement.reset());
  }

  return (
    <div className={styles.panel}>
      <strong>
        {isChannelEncrypted ? t('encryption.titleActive') : t('encryption.titleInactive')}
      </strong>
      <p>{t('encryption.hint')}</p>

      {deviceStatus === 'loading' ? (
        <p className={styles.status} role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('encryption.deviceLoading')}
        </p>
      ) : null}
      {deviceStatus === 'error' ? (
        <p className={cn(styles.status, styles.errorText)} role="alert">
          {t('encryption.deviceError', {
            error: encryption.deviceError ?? t('encryption.error.deviceSetup'),
          })}
        </p>
      ) : null}
      {encryption.isWaitingForKey ? <p role="status">{t('encryption.waitingForKey')}</p> : null}

      <div className={styles.section}>
        <strong>{t('encryption.loses.title')}</strong>
        <ul className={styles.losses}>
          <li>{t('encryption.loses.search')}</li>
          <li>{t('encryption.loses.automod')}</li>
          <li>{t('encryption.loses.bots')}</li>
          <li>{t('encryption.loses.mentions')}</li>
          <li>{t('encryption.loses.push')}</li>
        </ul>
        <p>{t('encryption.loses.recovery')}</p>
      </div>

      {!E2EE_UI_ENABLED && !isChannelEncrypted ? (
        <p>{t('encryption.unavailable')}</p>
      ) : encryption.canManageEncryption ? (
        <div className={styles.section}>
          {isChannelEncrypted ? <p>{t('encryption.disableHint')}</p> : null}
          <div className={styles.actions}>
            <Button
              size="sm"
              variant={isChannelEncrypted ? 'ghost' : 'primary'}
              disabled={isUpdating || (!isChannelEncrypted && deviceStatus !== 'ready')}
              onClick={() => void encryption.setEncryption(!isChannelEncrypted)}
            >
              {isChannelEncrypted ? t('encryption.action.disable') : t('encryption.action.enable')}
            </Button>
          </div>
        </div>
      ) : (
        <p>{t('encryption.managerOnly')}</p>
      )}

      {encryption.hasLockedLegacyMessages ? (
        <form className={styles.section} onSubmit={handleLegacySubmit}>
          <strong>{t('encryption.legacy.title')}</strong>
          <p>{t('encryption.legacy.hint')}</p>
          <TextField
            name="passphrase"
            type="password"
            placeholder={t('encryption.passphrasePlaceholder')}
            aria-label={t('encryption.passphrasePlaceholder')}
            autoComplete="off"
            required
          />
          <div className={styles.actions}>
            <Button size="sm" type="submit" variant="secondary">
              {t('encryption.action.unlockLegacy')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
