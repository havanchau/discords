import type { PublicUser, ServerMemberDetail, UserProfileServerContext } from '../api';

export interface MemberIdentity {
  displayName: string;
  avatarUrl: string | null;
}

interface PerServerIdentity {
  nickname?: string | null;
  avatarUrl?: string | null;
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
  };
}

export function memberIdentityOf(member: ServerMemberDetail): MemberIdentity {
  return resolveMemberIdentity(member.user, member);
}

export function profileIdentityOf(
  user: Pick<PublicUser, 'displayName' | 'avatarUrl'>,
  server: UserProfileServerContext | null,
): MemberIdentity {
  return resolveMemberIdentity(user, server);
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
