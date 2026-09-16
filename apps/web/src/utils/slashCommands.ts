import type { MessageKey } from '../i18n/LocaleProvider';

export interface SlashCommandDefinition {
  name: string;
  descriptionKey: MessageKey;
  usage: string;
  owner: 'client' | 'server';
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { name: 'me', descriptionKey: 'slash.me.description', usage: '/me waves hello', owner: 'client' },
  { name: 'nick', descriptionKey: 'slash.nick.description', usage: '/nick New nickname', owner: 'server' },
  {
    name: 'poll',
    descriptionKey: 'slash.poll.description',
    usage: '/poll Favorite color? | Red | Blue',
    owner: 'client',
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

export function parseSlashCommand(input: string): ParsedSlashCommand {
  if (!input.startsWith('/')) return { isCommand: false, name: '', args: input };
  const [rawName = '', ...rest] = input.slice(1).trimStart().split(/\s+/);
  const name = rawName.toLowerCase();
  const args = rest.join(' ').trim();
  if (!name) return { isCommand: true, name: '', args: '', errorKey: 'slash.error.noName' };
  const definition = SLASH_COMMANDS.find((command) => command.name === name);
  if (!definition)
    return { isCommand: true, name, args, errorKey: 'slash.error.unknown', errorVars: { name } };
  return { isCommand: true, name, args, definition };
}

export function getSlashCommandSuggestions(input: string): SlashCommandDefinition[] {
  if (!input.startsWith('/')) return [];
  const query = input.slice(1).trimStart().split(/\s+/)[0]?.toLowerCase() ?? '';
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(query)).sort((a, b) => {
    if (a.name === query) return -1;
    if (b.name === query) return 1;
    return a.name.localeCompare(b.name);
  });
}
