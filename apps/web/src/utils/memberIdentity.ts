import type { PublicUser, Role, ServerMemberDetail, UserProfileServerContext } from '@/api';

export interface MemberIdentity {
  displayName: string;
  avatarUrl: string | null;
  /** The member's highest-`position` role that has an icon; `null` when none of their roles do. */
  roleIconUrl: string | null;
}

type RoleForIcon = Pick<Role, 'id' | 'name'> & { position?: number; iconUrl?: string | null };

interface PerServerIdentity {
  nickname?: string | null;
  avatarUrl?: string | null;
  roles?: Array<{ role: RoleForIcon }>;
}

/**
 * The member's highest-`position` role that carries an icon (`@everyone` excluded), matching the
 * "last matching entry in ascending-position order" rule hoist grouping also uses
 * (docs/features/role-hoist-and-icon.md). `position` is optional only on the profile-card path
 * (`UserProfileServerContext`, whose `select` a different file owns — see the hand-back); missing
 * values sort first, never winning over a role that does carry one.
 */
function pickRoleIconUrl(roles?: PerServerIdentity['roles']): string | null {
  const candidates = (roles ?? [])
    .map(({ role }) => role)
    .filter((role) => role.name !== '@everyone' && role.iconUrl)
    // `member.roles` arrives in the DB's join order, not `position` order (Current behavior), so
    // this sorts explicitly rather than relying on array order the way `server.roles` already is.
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const highest = candidates.at(-1);
  return highest?.iconUrl ?? null;
}

/**
 * The one place the per-server override chain lives. Every surface that renders a member imports
 * this, so the member list, the message author line, and the profile card cannot drift apart.
 */
export function resolveMemberIdentity(
  user: Pick<PublicUser, 'displayName' | 'avatarUrl'>,
  member?: PerServerIdentity | null,
): MemberIdentity {
  return {
    displayName: member?.nickname?.trim() || user.displayName,
    avatarUrl: member?.avatarUrl || user.avatarUrl || null,
    roleIconUrl: pickRoleIconUrl(member?.roles),
  };
}

export function memberIdentityOf(member: ServerMemberDetail): MemberIdentity {
  return resolveMemberIdentity(member.user, member);
}

export function profileIdentityOf(
  user: Pick<PublicUser, 'displayName' | 'avatarUrl'>,
  server: UserProfileServerContext | null,
): MemberIdentity {
  return resolveMemberIdentity(user, {
    ...server,
    roles: server?.roles.map((role) => ({ role })),
  });
}

/** Lookup by user id for surfaces that render many authors, such as the message list. */
export function buildMemberIdentityMap(
  members: ServerMemberDetail[] | undefined,
): Record<string, MemberIdentity> {
  const identities: Record<string, MemberIdentity> = {};
  for (const member of members ?? []) {
    identities[member.user.id] = memberIdentityOf(member);
  }
  return identities;
}
