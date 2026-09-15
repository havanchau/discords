import type { SettingsModalFields } from './types';
import { SessionsSettings } from './SessionsSettings';
import { TwoFactorSettings } from './TwoFactorSettings';
import styles from '../SettingsModal.module.css';

type AccountSecuritySettingsProps = Pick<SettingsModalFields, 'auth' | 'signOut'>;

/** Security controls that act immediately, shown under the profile form rather than inside it. */
export function AccountSecuritySettings({ auth, signOut }: AccountSecuritySettingsProps) {
  return (
    <div className={styles.settingsForm}>
      <TwoFactorSettings accessToken={auth.accessToken} />
      <SessionsSettings auth={auth} onCurrentSessionRevoked={signOut} />
    </div>
  );
}
