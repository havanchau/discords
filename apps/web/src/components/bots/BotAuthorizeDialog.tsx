import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { assetUrl, type BotAuthorization } from '@/api';
import { Avatar, Badge, Banner, Button, DialogContent, DialogRoot } from '@/components/ui';
import { SettingsSelect } from '@/components/settings/SettingsSelect';
import {
  clearBotAuthorizeLink,
  readBotAuthorizeLink,
  useBotAuthorization,
} from '@/hooks/useBotAuthorization';
import { useTranslation } from '@/i18n/LocaleProvider';
import { initials } from '@/helpers';
import styles from './BotAuthorizeDialog.module.css';

/**
 * Opens when the page was loaded from a bot's authorize link (`/bots/:botId/authorize?serverId=`).
 * The viewer picks one of their servers where they hold MANAGE_ROLES and a role they may grant; the
 * API re-checks both on confirm.
 */
export function BotAuthorizeDialog() {
  const t = useTranslation();
  const [link, setLink] = useState(readBotAuthorizeLink);
  const [isDone, setIsDone] = useState(false);
  const data = useBotAuthorization(link?.botId ?? null);

  if (!link) return null;

  function close() {
    clearBotAuthorizeLink();
    setLink(null);
  }

  return (
    <DialogRoot open onOpenChange={(open) => !open && close()}>
      <DialogContent title={t('bot.authorize.title')} description={t('bot.authorize.description')}>
        <div className={styles.body}>
          {data.isLoading ? (
            <p className="empty-note" role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" /> {t('bot.authorize.loading')}
            </p>
          ) : data.error || !data.authorization ? (
            <Banner variant="danger">
              {data.error instanceof Error
                ? data.error.message
                : t('error.fallback.cannot-load-bot-authorization')}
            </Banner>
          ) : isDone ? (
            <>
              <Banner variant="success">
                {t('bot.authorize.done', { name: data.authorization.bot.name })}
              </Banner>
              <div className={styles.footer}>
                <Button type="button" onClick={close}>
                  {t('bot.action.dismiss')}
                </Button>
              </div>
            </>
          ) : (
            <AuthorizeForm
              authorization={data.authorization}
              preselectedServerId={link.serverId}
              isAuthorizing={data.isAuthorizing}
              onCancel={close}
              onConfirm={async (serverId, roleId) => {
                await data.authorize({ serverId, roleId });
                setIsDone(true);
              }}
            />
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

interface AuthorizeFormProps {
  authorization: BotAuthorization;
  preselectedServerId: string | null;
  isAuthorizing: boolean;
  onCancel: () => void;
  onConfirm: (serverId: string, roleId: string) => Promise<void>;
}

function AuthorizeForm({
  authorization,
  preselectedServerId,
  isAuthorizing,
  onCancel,
  onConfirm,
}: AuthorizeFormProps) {
  const t = useTranslation();
  const { bot, servers } = authorization;
  const [serverId, setServerId] = useState(
    servers.find((server) => server.id === preselectedServerId)?.id ?? servers[0]?.id ?? '',
  );
  const server = servers.find((candidate) => candidate.id === serverId) ?? null;
  const roles = server?.grantableRoles ?? [];
  // A named role says more than @everyone, which the bot receives anyway.
  const defaultRoleId = (roles.find((role) => role.name !== '@everyone') ?? roles[0])?.id ?? '';
  const [roleChoice, setRoleChoice] = useState<{ serverId: string; roleId: string } | null>(null);
  const roleId = roleChoice?.serverId === serverId ? roleChoice.roleId : defaultRoleId;
  const [error, setError] = useState<string | null>(null);

  const blockedReason = !server
    ? null
    : server.banned
      ? t('bot.authorize.banned')
      : server.alreadyMember
        ? t('bot.authorize.alreadyMember')
        : !roles.length
          ? t('bot.authorize.noGrantableRoles')
          : null;

  async function confirm() {
    if (!server || !roleId || blockedReason) return;
    setError(null);
    try {
      await onConfirm(server.id, roleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-authorize-bot'));
    }
  }

  return (
    <>
      <div className={styles.identity}>
        <Avatar
          src={bot.avatarUrl ? assetUrl(bot.avatarUrl) : null}
          alt={bot.name}
          fallback={initials(bot.name)}
        />
        <strong>{bot.name}</strong>
        <Badge variant="neutral">{t('message.botBadge')}</Badge>
      </div>

      {servers.length ? (
        <>
          <SettingsSelect
            name="serverId"
            label={t('bot.authorize.server')}
            defaultValue={serverId}
            options={servers.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            onValueChange={setServerId}
          />
          {roles.length ? (
            <SettingsSelect
              key={serverId}
              name="roleId"
              label={t('bot.authorize.role')}
              defaultValue={roleId}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              onValueChange={(value) => setRoleChoice({ serverId, roleId: value })}
            />
          ) : null}
          <p className="empty-note">{t('bot.authorize.roleHint')}</p>
        </>
      ) : (
        <p className="empty-note">{t('bot.authorize.noServers')}</p>
      )}

      {blockedReason ? <Banner variant="info">{blockedReason}</Banner> : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}

      <div className={styles.footer}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          disabled={!server || !roleId || Boolean(blockedReason) || isAuthorizing}
          onClick={() => void confirm()}
        >
          {isAuthorizing ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
          {t('bot.authorize.confirm')}
        </Button>
      </div>
    </>
  );
}
