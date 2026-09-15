import { Loader2, Monitor } from 'lucide-react';
import type { AuthState } from '../../api';
import { useSessions } from '../../hooks/useSessions';
import { describeUserAgent } from '../../utils/userAgent';
import { Badge, Button } from '../ui';
import styles from '../SettingsModal.module.css';

interface SessionsSettingsProps {
  auth: AuthState;
  onCurrentSessionRevoked: () => void;
}

export function SessionsSettings({ auth, onCurrentSessionRevoked }: SessionsSettingsProps) {
  const { sessions, isLoading, error, pendingSessionId, revokeSession, revokeOtherSessions } =
    useSessions({ accessToken: auth.accessToken, onCurrentSessionRevoked });
  const hasOtherSessions = sessions.some((session) => !session.current);

  return (
    <section className={styles.settingsSection} aria-labelledby="devices-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="devices-title">Devices</strong>
        <span>Where your account is signed in. Signing a device out takes effect immediately.</span>
      </div>
      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.inviteList}>
        {isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> Loading devices
          </p>
        ) : sessions.length ? (
          sessions.map((session) => (
            <div className={styles.inviteRow} key={session.id}>
              <div>
                <strong>
                  <Monitor size={14} aria-hidden="true" /> {describeUserAgent(session.userAgent)}{' '}
                  {session.current ? <Badge variant="success">This device</Badge> : null}
                </strong>
                <small>Last active {new Date(session.lastActiveAt).toLocaleString()}</small>
              </div>
              <span />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pendingSessionId === session.id}
                onClick={() => void revokeSession(session)}
              >
                Sign out
              </Button>
            </div>
          ))
        ) : (
          <p className="empty-note">No active devices.</p>
        )}
      </div>
      {hasOtherSessions ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pendingSessionId === 'others'}
          onClick={() => void revokeOtherSessions()}
        >
          Sign out all other devices
        </Button>
      ) : null}
    </section>
  );
}
