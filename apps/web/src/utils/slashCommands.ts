export interface SlashCommandDefinition {
  name: string;
  description: string;
  usage: string;
  owner: 'client' | 'server';
}

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { name: 'me', description: 'Send an action-style message.', usage: '/me waves hello', owner: 'client' },
  { name: 'nick', description: 'Update your server nickname.', usage: '/nick New nickname', owner: 'server' },
  { name: 'poll', description: 'Create a lightweight poll prompt.', usage: '/poll Favorite color? | Red | Blue', owner: 'client' },
  { name: 'invite', description: 'Create and send an invite code.', usage: '/invite', owner: 'server' },
];

export interface ParsedSlashCommand {
  isCommand: boolean;
  name: string;
  args: string;
  definition?: SlashCommandDefinition;
  error?: string;
}

export function parseSlashCommand(input: string): ParsedSlashCommand {
  if (!input.startsWith('/')) return { isCommand: false, name: '', args: input };
  const [rawName = '', ...rest] = input.slice(1).trimStart().split(/\s+/);
  const name = rawName.toLowerCase();
  const args = rest.join(' ').trim();
  if (!name) return { isCommand: true, name: '', args: '', error: 'Type a command name.' };
  const definition = SLASH_COMMANDS.find((command) => command.name === name);
  if (!definition) return { isCommand: true, name, args, error: `Unknown command /${name}.` };
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
