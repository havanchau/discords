import { useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import type { AuthState, DeviceKey } from '@/api';
import { SafetyNumberDialog } from '@/components/chat/SafetyNumberDialog';
import { Badge, Button } from '@/components/ui';
import { useDeviceList } from '@/hooks/useDeviceList';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import styles from './DeviceListSettings.module.css';
import settingsStyles from '@/components/SettingsModal.module.css';

interface DeviceListSettingsProps {
  auth: AuthState;
}

/**
 * The devices that can read this account's encrypted messages. A removed device is skipped by every
 * future key share; it keeps whatever it had already decrypted.
 */
export function DeviceListSettings({ auth }: DeviceListSettingsProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const list = useDeviceList({ auth });
  const [verifying, setVerifying] = useState<DeviceKey | null>(null);
  const thisDeviceId = list.thisDevice?.deviceId ?? null;

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="encryption-devices-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="encryption-devices-title">{t('encryption.devices.title')}</strong>
        <span>{t('encryption.devices.hint')}</span>
      </div>
      {list.loadError ? (
        <p className="empty-note" role="alert">
          {t('encryption.devices.error')}
        </p>
      ) : null}
      {list.actionError ? (
        <p className="empty-note" role="alert">
          {list.actionError}
        </p>
      ) : null}
      <div className={styles.list}>
        {list.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
            {t('encryption.devices.loading')}
          </p>
        ) : list.devices.length ? (
          list.devices.map((device) => {
            const isThisDevice = device.deviceId === thisDeviceId;
            const isVerified = Boolean(list.verifiedByDeviceKeyId[device.id]);
            return (
              <div className={styles.row} key={device.id}>
                <div className={styles.info}>
                  <strong className={styles.name}>
                    <Smartphone size={14} aria-hidden="true" />{' '}
                    {device.label || t('encryption.devices.unnamed')}
                    {isThisDevice ? (
                      <Badge variant="success">{t('encryption.devices.thisDevice')}</Badge>
                    ) : (
                      <Badge variant={isVerified ? 'success' : 'neutral'}>
                        {isVerified
                          ? t('encryption.devices.verified')
                          : t('encryption.devices.unverified')}
                      </Badge>
                    )}
                  </strong>
                  <small>
                    {t('encryption.devices.firstSeen', { date: dates.absolute(device.createdAt) })}
                  </small>
                </div>
                {isThisDevice ? null : (
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!list.thisDevice}
                      onClick={() => setVerifying(device)}
                    >
                      {t('encryption.devices.action.verify')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={list.isRevoking}
                      onClick={() => void list.revokeDevice(device)}
                    >
                      {t('encryption.devices.action.revoke')}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="empty-note">{t('encryption.devices.empty')}</p>
        )}
      </div>
      {verifying && list.thisDevice ? (
        <SafetyNumberDialog
          deviceName={verifying.label || t('encryption.devices.unnamed')}
          publicKeys={[list.thisDevice.publicKeySpki, verifying.publicKey]}
          isVerified={Boolean(list.verifiedByDeviceKeyId[verifying.id])}
          isSaving={list.isVerifying}
          onVerify={() => void list.verifyDevice(verifying)}
          onOpenChange={(open) => {
            if (!open) setVerifying(null);
          }}
        />
      ) : null}
    </section>
  );
}
