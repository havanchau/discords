import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER } from '@discord-clone/shared';
import type { OwnedBot } from '@/api';
import { Banner, Button, DialogContent, DialogRoot, IconButton } from '@/components/ui';
import { SettingsSelect } from '@/components/settings/SettingsSelect';
import { useBotCommands, useBotServers, type BotSlashCommand } from '@/hooks/useBotCommands';
import { useTranslation } from '@/i18n/LocaleProvider';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './BotCommandsDialog.module.css';
import { CommandForm, type CommandInput } from './BotCommandForm';

interface BotCommandsDialogProps {
  bot: OwnedBot;
  onClose: () => void;
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Slash command management for one of the viewer's own bots, per server. The API re-checks every rule
 * (reserved name, duplicate, per-server limit, immutable name); the checks here only save a round trip.
 */
export function BotCommandsDialog({ bot, onClose }: BotCommandsDialogProps) {
  const t = useTranslation();
  const serverList = useBotServers(bot.id);
  const [pickedServerId, setPickedServerId] = useState<string | null>(null);
  const serverId = pickedServerId ?? serverList.servers[0]?.id ?? null;
  const commands = useBotCommands(bot.id, serverId);
  const [editing, setEditing] = useState<BotSlashCommand | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isFull = commands.commands.length >= SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER;

  async function save(input: CommandInput) {
    setError(null);
    try {
      if (editing && editing !== 'new') {
        await commands.updateCommand({
          commandId: editing.id,
          input: { description: input.description, options: input.options },
        });
      } else {
        await commands.createCommand(input);
      }
      setEditing(null);
    } catch (err) {
      setError(errorText(err, t('error.fallback.cannot-save-bot-command')));
    }
  }

  async function remove(commandId: string) {
    setConfirmId(null);
    setError(null);
    try {
      await commands.deleteCommand(commandId);
    } catch (err) {
      setError(errorText(err, t('error.fallback.cannot-delete-bot-command')));
    }
  }

  function selectServer(nextServerId: string) {
    setPickedServerId(nextServerId);
    setEditing(null);
    setConfirmId(null);
    setError(null);
  }

  return (
    <DialogRoot open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t('bot.commands.title')}
        description={t('bot.commands.description', { name: bot.name })}
      >
        <div className={styles.body}>
          {serverList.isLoading ? (
            <p className="empty-note" role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
              {t('bot.commands.loadingServers')}
            </p>
          ) : serverList.error ? (
            <Banner variant="danger">
              {errorText(serverList.error, t('error.fallback.cannot-load-bot-servers'))}
            </Banner>
          ) : !serverId ? (
            <p className="empty-note">{t('bot.commands.noServers')}</p>
          ) : (
            <>
              <SettingsSelect
                name="serverId"
                label={t('bot.commands.server')}
                defaultValue={serverId}
                options={serverList.servers.map((server) => ({
                  value: server.id,
                  label: server.name,
                }))}
                onValueChange={selectServer}
              />

              {commands.isLoading ? (
                <p className="empty-note" role="status">
                  <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
                  {t('bot.commands.loading')}
                </p>
              ) : commands.error ? (
                <Banner variant="danger">
                  {errorText(commands.error, t('error.fallback.cannot-load-bot-commands'))}
                </Banner>
              ) : (
                <div className={settingsStyles.inviteList}>
                  {commands.commands.length ? (
                    commands.commands.map((command) => (
                      <div className={settingsStyles.inviteRow} key={command.id}>
                        <span className={styles.commandText}>
                          <strong>{`/${command.name}`}</strong>
                          <small>{command.description}</small>
                          <small>
                            {t('bot.commands.optionCount', { count: command.options.length })}
                          </small>
                        </span>
                        {confirmId === command.id ? (
                          <>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={commands.isBusy}
                              onClick={() => void remove(command.id)}
                            >
                              {t('bot.commands.action.confirmDelete')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                              {t('common.cancel')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <IconButton
                              label={t('bot.commands.action.edit', { name: command.name })}
                              size="sm"
                              onClick={() => {
                                setError(null);
                                setConfirmId(null);
                                setEditing(command);
                              }}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={t('bot.commands.action.delete', { name: command.name })}
                              variant="danger"
                              size="sm"
                              onClick={() => setConfirmId(command.id)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="empty-note">{t('bot.commands.empty')}</p>
                  )}
                </div>
              )}

              {error ? <Banner variant="danger">{error}</Banner> : null}
              {isFull ? <p className="empty-note">{t('bot.commands.limitReached')}</p> : null}

              {editing ? (
                <CommandForm
                  key={editing === 'new' ? 'new' : editing.id}
                  command={editing === 'new' ? null : editing}
                  isBusy={commands.isBusy}
                  onCancel={() => setEditing(null)}
                  onSubmit={save}
                />
              ) : (
                <div className={styles.footer}>
                  <Button
                    disabled={isFull || commands.isLoading || Boolean(commands.error)}
                    onClick={() => {
                      setError(null);
                      setEditing('new');
                    }}
                  >
                    <Plus size={14} aria-hidden="true" />
                    {t('bot.commands.action.add')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
