import type { SettingsModalFields } from './types';
import { AccountDangerZoneSection } from './AccountDangerZoneSection';
import { AccountDataExportSection } from './AccountDataExportSection';
import { BotsSection } from './BotsSection';
import { DeviceListSettings } from './DeviceListSettings';
import { SessionsSettings } from './SessionsSettings';
import { TwoFactorSettings } from './TwoFactorSettings';
import styles from '@/components/SettingsModal.module.css';

type AccountSecuritySettingsProps = Pick<SettingsModalFields, 'auth' | 'signOut'>;

/** Security controls that act immediately, shown under the profile form rather than inside it. */
export function AccountSecuritySettings({ auth, signOut }: AccountSecuritySettingsProps) {
  return (
    <div className={styles.settingsForm}>
      <TwoFactorSettings accessToken={auth.accessToken} />
      <SessionsSettings auth={auth} onCurrentSessionRevoked={signOut} />
      <DeviceListSettings auth={auth} />
      <BotsSection />
      <AccountDataExportSection auth={auth} />
      <AccountDangerZoneSection accessToken={auth.accessToken} signOut={signOut} />
    </div>
  );
}
