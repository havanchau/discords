import type { SlashCommandOption, SlashCommandView } from '@discord-clone/shared';
import type { Json } from '@discord-clone/shared';
import type { MessageKey } from '@/i18n/LocaleProvider';

export interface SlashCommandDefinition {
  name: string;
  usage: string;
  owner: 'client' | 'server' | 'bot';
  /** Built-ins only: their copy goes through i18n. */
  descriptionKey?: MessageKey;
  /** Bot commands only: operator-supplied, not localized (same as a bot's display name). */
  description?: string;
  /** Bot commands only: routes `executeSlashCommand`'s invoke call. */
  botId?: string;
  commandId?: string;
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { name: 'me', descriptionKey: 'slash.me.description', usage: '/me waves hello', owner: 'client' },
  {
    name: 'nick',
    descriptionKey: 'slash.nick.description',
    usage: '/nick New nickname',
    owner: 'server',
  },
  {
    name: 'poll',
    descriptionKey: 'slash.poll.description',
    usage: '/poll Favorite color? | Red | Blue',
    owner: 'server',
  },
  { name: 'invite', descriptionKey: 'slash.invite.description', usage: '/invite', owner: 'server' },
];

export interface ParsedSlashCommand {
  isCommand: boolean;
  name: string;
  args: string;
  definition?: SlashCommandDefinition;
  /** Callers translate this; the parser has no locale of its own. */
  errorKey?: MessageKey;
  errorVars?: Record<string, string>;
}

/**
 * Server-registered bot commands, merged after the built-ins so a built-in name always wins a
 * collision (the registry also refuses a bot that tries to claim one, `bot-gateway-and-slash-
 * commands.md` → Registry → collision rules, but the client never trusts that alone).
 */
export function parseSlashCommand(
  input: string,
  serverCommands: SlashCommandDefinition[] = [],
): ParsedSlashCommand {
  if (!input.startsWith('/')) return { isCommand: false, name: '', args: input };
  const [rawName = '', ...rest] = input.slice(1).trimStart().split(/\s+/);
  const name = rawName.toLowerCase();
  const args = rest.join(' ').trim();
  if (!name) return { isCommand: true, name: '', args: '', errorKey: 'slash.error.noName' };
  const definition = [...SLASH_COMMANDS, ...serverCommands].find(
    (command) => command.name === name,
  );
  if (!definition)
    return { isCommand: true, name, args, errorKey: 'slash.error.unknown', errorVars: { name } };
  return { isCommand: true, name, args, definition };
}

export function getSlashCommandSuggestions(
  input: string,
  serverCommands: SlashCommandDefinition[] = [],
): SlashCommandDefinition[] {
  if (!input.startsWith('/')) return [];
  const query = input.slice(1).trimStart().split(/\s+/)[0]?.toLowerCase() ?? '';
  return [...SLASH_COMMANDS, ...serverCommands]
    .filter((command) => command.name.startsWith(query))
    .sort((a, b) => {
      if (a.name === query) return -1;
      if (b.name === query) return 1;
      return a.name.localeCompare(b.name);
    });
}

function formatOptionUsage(option: SlashCommandOption): string {
  return option.required ? `<${option.name}>` : `[${option.name}]`;
}

/** Maps a server's registered command (`GET /servers/:serverId` → `slashCommands`) to a suggestion. */
export function toBotSlashCommandDefinition(
  command: Json<SlashCommandView>,
): SlashCommandDefinition {
  const usage = [`/${command.name}`, ...command.options.map(formatOptionUsage)].join(' ');
  return {
    name: command.name,
    usage,
    owner: 'bot',
    description: command.description,
    botId: command.botId,
    commandId: command.id,
  };
}
