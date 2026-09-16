import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '../../i18n/LocaleProvider';
import { useDateFormat } from '../../i18n/useDateFormat';
import { Button } from '../ui';
import type { SettingsModalFields } from './types';
import styles from '../SettingsModal.module.css';

type ServerBansSectionProps = Pick<
  SettingsModalFields,
  'server' | 'bans' | 'isLoadingBans' | 'bansError' | 'loadBans' | 'unbanUser' | 'pendingAction'
>;

export function ServerBansSection({
  server,
  bans,
  isLoadingBans,
  bansError,
  loadBans,
  unbanUser,
  pendingAction,
}: ServerBansSectionProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const serverId = server?.id;

  // Bans live on the API; refresh them whenever this section opens for a server. loadBans is
  // recreated on every workspace render, so only the server id drives the refresh.
  useEffect(() => {
    if (serverId) void loadBans(serverId);
  }, [serverId]);

  return (
    <section className={styles.settingsSection} aria-labelledby="server-bans-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="server-bans-title">{t('bans.section.title')}</strong>
        <span>{t('bans.section.hint')}</span>
      </div>
      <div className={styles.inviteList}>
        {isLoadingBans ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('bans.loading')}
          </p>
        ) : bansError ? (
          <p className="empty-note" role="alert">
            {bansError}
          </p>
        ) : bans.length ? (
          bans.map((ban) => (
            <div className={styles.inviteRow} key={ban.id}>
              <div>
                <strong>{ban.user.displayName}</strong>
                <small>
                  {ban.reason ? `${ban.reason} · ` : ''}
                  {t('bans.by', {
                    date: dates.absolute(ban.createdAt),
                    actor: ban.bannedBy.displayName,
                  })}
                </small>
              </div>
              <span />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pendingAction === `member-unban-${ban.user.id}`}
                onClick={() => void unbanUser(ban.user.id)}
              >
                {t('bans.action.unban')}
              </Button>
            </div>
          ))
        ) : (
          <p className="empty-note">{t('bans.empty')}</p>
        )}
      </div>
    </section>
  );
}
