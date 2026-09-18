import { apiRequest, type AuthState, type Channel, type Message, type ServerDetail } from '@/api';
import type { Translate } from '@/i18n/LocaleProvider';
import { parsePollCommand } from './polls';
import { parseSlashCommand, toBotSlashCommandDefinition } from './slashCommands';

interface ExecuteSlashCommandOptions {
  content: string;
  /** A poll stores its question and options in plaintext, so it is refused in an encrypted channel. */
  isChannelEncrypted: boolean;
  auth: AuthState;
  server: ServerDetail | null;
  channel: Channel | null;
  openServer: (
    serverId: string,
    token?: string,
    preferredChannelId?: string | null,
  ) => Promise<void>;
  clearDraft: () => void;
  /** Adds a message the API created, in case the realtime echo is missed. */
  addMessage: (message: Message) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
  /**
   * Invokes a server-registered bot command (`owner: 'bot'`); owns the wait/timeout UI itself and
   * resolves false when the invoke was refused, so the draft is kept for a retry.
   */
  invokeBotCommand: (params: {
    channelId: string;
    commandId: string;
    commandName: string;
    args: string;
  }) => Promise<boolean>;
  t: Translate;
}

export type SlashCommandExecutionResult = { handled: false; content: string } | { handled: true };

export async function executeSlashCommand({
  content,
  auth,
  isChannelEncrypted,
  server,
  channel,
  openServer,
  clearDraft,
  addMessage,
  setWorkspaceError,
  setWorkspaceNotice,
  invokeBotCommand,
  t,
}: ExecuteSlashCommandOptions): Promise<SlashCommandExecutionResult> {
  const command = parseSlashCommand(
    content,
    server?.slashCommands.map(toBotSlashCommandDefinition),
  );
  if (!command.isCommand) return { handled: false, content };

  if (command.errorKey) {
    setWorkspaceError(t(command.errorKey, command.errorVars));
    return { handled: true };
  }

  if (command.definition?.owner === 'bot') {
    if (!channel || !command.definition.commandId) return { handled: true };
    const invoked = await invokeBotCommand({
      channelId: channel.id,
      commandId: command.definition.commandId,
      commandName: command.name,
      args: command.args,
    });
    if (invoked) clearDraft();
    return { handled: true };
  }

  if (command.name === 'me') {
    return {
      handled: false,
      content: `*${auth.user.displayName} ${command.args || t('slash.me.default')}*`,
    };
  }

  if (command.name === 'poll') {
    if (!channel) return { handled: true };
    if (isChannelEncrypted) {
      setWorkspaceError(t('poll.error.encryptedChannel'));
      return { handled: true };
    }
    const parsed = parsePollCommand(command.args, Date.now());
    if ('errorKey' in parsed) {
      setWorkspaceError(t(parsed.errorKey, parsed.errorVars));
      return { handled: true };
    }
    try {
      const result = await apiRequest<{ message: Message }>(
        `/channels/${channel.id}/polls`,
        { method: 'POST', body: JSON.stringify(parsed.input) },
        auth.accessToken,
      );
      addMessage(result.message);
      clearDraft();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-create-poll'),
      );
    }
    return { handled: true };
  }

  if (!server) return { handled: true };

  if (command.name === 'nick') {
    await apiRequest(
      `/servers/${server.id}/members/me`,
      { method: 'PATCH', body: JSON.stringify({ nickname: command.args }) },
      auth.accessToken,
    );
    await openServer(server.id, auth.accessToken, channel?.id);
    setWorkspaceNotice(
      command.args ? t('slash.nick.updated', { nickname: command.args }) : t('slash.nick.cleared'),
    );
    clearDraft();
    return { handled: true };
  }

  if (command.name === 'invite') {
    const result = await apiRequest<{ invite: { code: string } }>(
      `/servers/${server.id}/invites`,
      { method: 'POST', body: JSON.stringify({ channelId: channel?.id }) },
      auth.accessToken,
    );
    return { handled: false, content: t('slash.invite.content', { code: result.invite.code }) };
  }

  return { handled: false, content };
}
