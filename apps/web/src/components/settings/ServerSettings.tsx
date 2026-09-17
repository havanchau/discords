import { Clipboard, Trash2 } from 'lucide-react';
import { Button, IconButton, TextField } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { memberHasServerPermission } from '@/utils/serverPermissions';
import { AutoModSection } from './AutoModSection';
import { ServerBansSection } from './ServerBansSection';
import { ServerEmojiSection } from './ServerEmojiSection';
import { ServerSoundboardSection } from './ServerSoundboardSection';
import { ServerStickersSection } from './ServerStickersSection';
import { ServerDiscoverySettings } from './ServerDiscoverySettings';
import { ServerOnboardingSettings } from './ServerOnboardingSettings';
import { ServerTemplatesSection } from './ServerTemplatesSection';
import { ReportsSection } from './ReportsSection';
import type { SettingsModalFields } from './types';
import styles from '@/components/SettingsModal.module.css';
import { cn } from '@/utils/cn';

type ServerSettingsProps = Pick<
  SettingsModalFields,
  | 'auth'
  | 'bans'
  | 'isLoadingBans'
  | 'bansError'
  | 'loadBans'
  | 'unbanUser'
  | 'emojis'
  | 'isLoadingEmojis'
  | 'emojisError'
  | 'createEmoji'
  | 'deleteEmoji'
  | 'auditLogs'
  | 'createInviteFromSettings'
  | 'invites'
  | 'pendingAction'
  | 'revokeInvite'
  | 'server'
  | 'setActiveDialog'
  | 'updateServerSettings'
>;

export function ServerSettings({
  auth,
  bans,
  isLoadingBans,
  bansError,
  loadBans,
  unbanUser,
  emojis,
  isLoadingEmojis,
  emojisError,
  createEmoji,
  deleteEmoji,
  auditLogs,
  createInviteFromSettings,
  invites,
  pendingAction,
  revokeInvite,
  server,
  setActiveDialog,
  updateServerSettings,
}: ServerSettingsProps) {
  const t = useTranslation();
  const dates = useDateFormat();

  if (!server) return null;

  return (
    <div className={styles.settingsForm}>
      <form
        className={styles.settingsSection}
        onSubmit={(event) => void updateServerSettings(event)}
      >
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => setActiveDialog('roles')}
        >
          {t('serverSettings.manageRoles')}
        </Button>
        <TextField
          label={t('serverSettings.field.name')}
          name="name"
          defaultValue={server.name}
          minLength={2}
          maxLength={80}
          required
        />
        <TextField
          label={t('serverSettings.field.description')}
          name="description"
          defaultValue={server.description ?? ''}
          maxLength={200}
        />
        <footer className={styles.settingsModalFooter}>
          <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={pendingAction === 'server-update'}>
            {t('common.saveChanges')}
          </Button>
        </footer>
      </form>

      <section className={cn(styles.settingsSection, 'invite-section')}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('invite.section.title')}</strong>
          <span>{t('invite.section.hint')}</span>
        </div>
        <form
          className={styles.inviteCreateGrid}
          onSubmit={(event) => void createInviteFromSettings(event)}
        >
          <TextField
            label={t('invite.field.expiresInHours')}
            name="expiresInHours"
            type="number"
            min={1}
            max={168}
            defaultValue="24"
          />
          <TextField
            label={t('invite.field.maxUses')}
            name="maxUses"
            type="number"
            min={1}
            max={100}
            placeholder="100"
          />
          <Button type="submit" disabled={pendingAction === 'invite-settings-create'}>
            {t('invite.action.create')}
          </Button>
        </form>
        <div className={styles.inviteList}>
          {invites.length ? (
            invites.map((invite) => (
              <div className={styles.inviteRow} key={invite.id}>
                <div>
                  <strong>{invite.code}</strong>
                  <small>
                    {t('invite.usage', {
                      used: invite.usedCount,
                      max: invite.maxUses ?? '∞',
                      expiry: invite.expiresAt
                        ? dates.absolute(invite.expiresAt)
                        : t('invite.neverExpires'),
                    })}
                  </small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(invite.code)}
                >
                  <Clipboard size={14} aria-hidden="true" />
                  {t('invite.action.copy')}
                </Button>
                <IconButton
                  label={t('invite.action.revoke', { code: invite.code })}
                  variant="danger"
                  size="sm"
                  disabled={pendingAction === `invite-${invite.id}`}
                  onClick={() => void revokeInvite(invite.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </div>
            ))
          ) : (
            <p className="empty-note">{t('invite.empty')}</p>
          )}
        </div>
      </section>

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <ServerEmojiSection
          emojis={emojis}
          isLoadingEmojis={isLoadingEmojis}
          emojisError={emojisError}
          createEmoji={createEmoji}
          deleteEmoji={deleteEmoji}
        />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <ServerStickersSection server={server} />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <ServerSoundboardSection server={server} />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <AutoModSection server={server} />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <ServerOnboardingSettings server={server} />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <ServerDiscoverySettings server={server} />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? (
        <ServerTemplatesSection server={server} />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'BAN_MEMBERS') ? (
        <ServerBansSection
          server={server}
          bans={bans}
          isLoadingBans={isLoadingBans}
          bansError={bansError}
          loadBans={loadBans}
          unbanUser={unbanUser}
          pendingAction={pendingAction}
        />
      ) : null}

      {memberHasServerPermission(server, auth.user.id, 'MANAGE_MESSAGES') ? (
        <ReportsSection serverId={server.id} />
      ) : null}

      <section className={cn(styles.settingsSection, 'audit-section')}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('audit.section.title')}</strong>
          <span>{t('audit.section.hint')}</span>
        </div>
        <div className={styles.auditLogList}>
          {auditLogs.length ? (
            auditLogs.slice(0, 12).map((log) => (
              <details className={styles.auditLogRow} key={log.id}>
                <summary>
                  <span>{log.action.replaceAll('_', ' ').toLowerCase()}</span>
                  <small>
                    {log.actor?.displayName ?? t('audit.system')} - {dates.absolute(log.createdAt)}
                  </small>
                </summary>
                {log.metadata ? <pre>{JSON.stringify(log.metadata, null, 2)}</pre> : null}
              </details>
            ))
          ) : (
            <p className="empty-note">{t('audit.empty')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
