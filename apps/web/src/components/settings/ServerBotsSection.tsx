import { Loader2 } from 'lucide-react';
import { assetUrl } from '@/api';
import { Avatar } from '@/components/ui';
import { useServerBots, type ServerBot } from '@/hooks/useServerBots';
import { useTranslation } from '@/i18n/LocaleProvider';
import { initials } from '@/helpers';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ServerBotsSection.module.css';

interface ServerBotsSectionProps {
  serverId: string;
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Read-only, per-server admin view of installed bots and their commands in this server
 * (`server-bot-commands-admin-view.md`). No create/edit/delete action exists here for any bot,
 * including one the viewer happens to own themselves — that stays in account settings' `BotsSection`.
 */
export function ServerBotsSection({ serverId }: ServerBotsSectionProps) {
  const t = useTranslation();
  const { bots, isLoading, error } = useServerBots(serverId);

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-bots-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-bots-title">{t('bot.serverBots.title')}</strong>
        <span>{t('bot.serverBots.hint')}</span>
      </div>
      {isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('bot.serverBots.loading')}
        </p>
      ) : error ? (
        <p className="empty-note" role="alert">
          {errorText(error, t('error.fallback.cannot-load-server-bots'))}
        </p>
      ) : bots.length ? (
        <div className={styles.botList}>
          {bots.map((bot) => (
            <BotRow key={bot.id} bot={bot} />
          ))}
        </div>
      ) : (
        <p className="empty-note">{t('bot.serverBots.empty')}</p>
      )}
    </section>
  );
}

function BotRow({ bot }: { bot: ServerBot }) {
  const t = useTranslation();

  return (
    <div className={styles.botRow}>
      <span className={styles.identity}>
        <Avatar
          size="sm"
          src={bot.avatarUrl ? assetUrl(bot.avatarUrl) : null}
          alt={bot.name}
          fallback={initials(bot.name)}
        />
        <strong>{bot.name}</strong>
      </span>
      {bot.commands.length ? (
        <ul className={styles.commandList}>
          {bot.commands.map((command) => (
            <li className={styles.commandRow} key={command.id}>
              <strong>{`/${command.name}`}</strong>
              <small>{command.description}</small>
              <small>{t('bot.commands.optionCount', { count: command.options.length })}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">{t('bot.serverBots.noCommands')}</p>
      )}
    </div>
  );
}
