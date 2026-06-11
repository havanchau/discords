import { apiRequest, type AuthState, type Channel, type ServerDetail } from '../api';
import { parseSlashCommand } from './slashCommands';

interface ExecuteSlashCommandOptions {
  content: string;
  auth: AuthState;
  server: ServerDetail | null;
  channel: Channel | null;
  openServer: (serverId: string, token?: string, preferredChannelId?: string | null) => Promise<void>;
  clearDraft: () => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

export type SlashCommandExecutionResult =
  | { handled: false; content: string }
  | { handled: true };

export async function executeSlashCommand({
  content,
  auth,
  server,
  channel,
  openServer,
  clearDraft,
  setWorkspaceError,
  setWorkspaceNotice,
}: ExecuteSlashCommandOptions): Promise<SlashCommandExecutionResult> {
  const command = parseSlashCommand(content);
  if (!command.isCommand) return { handled: false, content };

  if (command.error) {
    setWorkspaceError(command.error);
    return { handled: true };
  }

  if (command.name === 'me') {
    return { handled: false, content: `*${auth.user.displayName} ${command.args || 'is here.'}*` };
  }

  if (command.name === 'poll') {
    const [question, ...options] = command.args
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      handled: false,
      content: options.length
        ? `📊 ${question}\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`
        : `📊 ${command.args || 'New poll'}`,
    };
  }

  if (!server) return { handled: true };

  if (command.name === 'nick') {
    await apiRequest(
      `/servers/${server.id}/members/me`,
      { method: 'PATCH', body: JSON.stringify({ nickname: command.args }) },
      auth.accessToken,
    );
    await openServer(server.id, auth.accessToken, channel?.id);
    setWorkspaceNotice(command.args ? `Nickname updated to ${command.args}.` : 'Nickname cleared.');
    clearDraft();
    return { handled: true };
  }

  if (command.name === 'invite') {
    const result = await apiRequest<{ invite: { code: string } }>(
      `/servers/${server.id}/invites`,
      { method: 'POST', body: JSON.stringify({ channelId: channel?.id }) },
      auth.accessToken,
    );
    return { handled: false, content: `Invite code: ${result.invite.code}` };
  }

  return { handled: false, content };
}
