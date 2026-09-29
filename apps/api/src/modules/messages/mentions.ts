/**
 * Shared `@token` parsing for channel messages — the one place that decides whether an `@word`
 * means `@everyone`, `@here`, a role, or a plain username, so the push path
 * (`MessagesService.notifyMentionedUsers`) and the unread-badge path
 * (`RealtimeUnreadService`) can never drift apart (docs/features/everyone-here-and-role-mentions.md).
 */

export type MentionToken =
  | { kind: 'everyone' }
  | { kind: 'here' }
  | { kind: 'role'; name: string }
  | { kind: 'user'; username: string };

const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;

/**
 * Resolution order, decided once so it is never re-litigated per call site: the `everyone`/`here`
 * keywords always win, then a role name for this server, then a plain username (today's behavior).
 * `roleNames` is this server's `Role.name` list; matching is case-insensitive and single-word only
 * (the parser does not match a role name containing a space — a known, documented limitation).
 */
export function parseMentionTokens(content: string, roleNames: readonly string[]): MentionToken[] {
  const roleNameSet = new Set(roleNames.map((name) => name.toLowerCase()));
  const rawTokens = [...content.matchAll(MENTION_PATTERN)].map((match) => match[1]);
  return rawTokens.map((raw): MentionToken => {
    const lower = raw.toLowerCase();
    if (lower === 'everyone') return { kind: 'everyone' };
    if (lower === 'here') return { kind: 'here' };
    if (roleNameSet.has(lower)) return { kind: 'role', name: raw };
    return { kind: 'user', username: raw };
  });
}

/** Only `everyone`/`here`/a role require `MentionEveryone`; a plain username mention never does. */
export function requiresMentionEveryonePermission(tokens: MentionToken[]): boolean {
  return tokens.some((token) => token.kind !== 'user');
}
