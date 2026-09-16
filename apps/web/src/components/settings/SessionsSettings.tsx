import { Loader2, Monitor } from 'lucide-react';
import type { AuthState } from '../../api';
import { useSessions } from '../../hooks/useSessions';
import { useTranslation } from '../../i18n/LocaleProvider';
import { useDateFormat } from '../../i18n/useDateFormat';
import { describeUserAgent } from '../../utils/userAgent';
import { Badge, Button } from '../ui';
import styles from '../SettingsModal.module.css';

interface SessionsSettingsProps {
  auth: AuthState;
  onCurrentSessionRevoked: () => void;
}

export function SessionsSettings({ auth, onCurrentSessionRevoked }: SessionsSettingsProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { sessions, isLoading, error, pendingSessionId, revokeSession, revokeOtherSessions } =
    useSessions({ accessToken: auth.accessToken, onCurrentSessionRevoked });
  const hasOtherSessions = sessions.some((session) => !session.current);

  return (
    <section className={styles.settingsSection} aria-labelledby="devices-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="devices-title">{t('devices.section.title')}</strong>
        <span>{t('devices.section.hint')}</span>
      </div>
      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.inviteList}>
        {isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('devices.loading')}
          </p>
        ) : sessions.length ? (
          sessions.map((session) => (
            <div className={styles.inviteRow} key={session.id}>
              <div>
                <strong>
                  <Monitor size={14} aria-hidden="true" /> {describeUserAgent(session.userAgent)}{' '}
                  {session.current ? <Badge variant="success">{t('devices.thisDevice')}</Badge> : null}
                </strong>
                <small>{t('devices.lastActive', { date: dates.absolute(session.lastActiveAt) })}</small>
              </div>
              <span />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pendingSessionId === session.id}
                onClick={() => void revokeSession(session)}
              >
                {t('devices.action.signOut')}
              </Button>
            </div>
          ))
        ) : (
          <p className="empty-note">{t('devices.empty')}</p>
        )}
      </div>
      {hasOtherSessions ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pendingSessionId === 'others'}
          onClick={() => void revokeOtherSessions()}
        >
          {t('devices.action.signOutOthers')}
        </Button>
      ) : null}
    </section>
  );
}
