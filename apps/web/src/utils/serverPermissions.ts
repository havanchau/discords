import type { ServerDetail } from '../api';

/*
 * Mirrors the API's server-level check (owner, or any role granting the permission). It only gates
 * UI affordances; the API enforces every action.
 */
export function memberHasServerPermission(
  server: Pick<ServerDetail, 'members'> | null,
  userId: string,
  permission: string,
) {
  const member = server?.members.find((item) => item.user.id === userId);
  if (!member) return false;
  if (member.kind === 'OWNER') return true;
  return Boolean(member.roles?.some(({ role }) => role.permissions.includes(permission)));
}

/** The member's active timeout end, or null when not timed out at `now`. */
export function activeTimeoutUntil(
  server: Pick<ServerDetail, 'members'> | null,
  userId: string,
  now: number,
) {
  const member = server?.members.find((item) => item.user.id === userId);
  if (!member?.timeoutUntil || member.kind === 'OWNER') return null;
  const until = new Date(member.timeoutUntil).getTime();
  return until > now ? until : null;
}
