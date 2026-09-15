import type { ServerDetail, ServerMemberDetail } from '../api';
import { activeTimeoutUntil, memberHasServerPermission } from './serverPermissions';

function member(overrides: Partial<ServerMemberDetail> & { userId: string }): ServerMemberDetail {
  const { userId, ...rest } = overrides;
  return {
    id: `member-${userId}`,
    kind: 'MEMBER',
    user: { id: userId, email: '', username: userId, displayName: userId },
    roles: [],
    ...rest,
  };
}

function server(members: ServerMemberDetail[]): Pick<ServerDetail, 'members'> {
  return { members };
}

describe('memberHasServerPermission', () => {
  it('grants every permission to the owner', () => {
    expect(
      memberHasServerPermission(
        server([member({ userId: 'u1', kind: 'OWNER' })]),
        'u1',
        'BAN_MEMBERS',
      ),
    ).toBe(true);
  });

  it('grants a permission held by any role', () => {
    const roles = [
      { role: { id: 'r1', name: '@everyone', permissions: ['VIEW_CHANNEL'] } },
      { role: { id: 'r2', name: 'Mod', permissions: ['BAN_MEMBERS'] } },
    ];

    expect(
      memberHasServerPermission(server([member({ userId: 'u1', roles })]), 'u1', 'BAN_MEMBERS'),
    ).toBe(true);
  });

  it('denies non-members and members without the permission', () => {
    const data = server([member({ userId: 'u1' })]);

    expect(memberHasServerPermission(data, 'u1', 'BAN_MEMBERS')).toBe(false);
    expect(memberHasServerPermission(data, 'missing', 'BAN_MEMBERS')).toBe(false);
  });
});

describe('activeTimeoutUntil', () => {
  const now = Date.parse('2026-09-15T12:00:00.000Z');

  it('returns the end of a future timeout', () => {
    const data = server([member({ userId: 'u1', timeoutUntil: '2026-09-15T12:10:00.000Z' })]);

    expect(activeTimeoutUntil(data, 'u1', now)).toBe(Date.parse('2026-09-15T12:10:00.000Z'));
  });

  it('ignores expired timeouts and owners', () => {
    const expired = server([member({ userId: 'u1', timeoutUntil: '2026-09-15T11:00:00.000Z' })]);
    const owner = server([
      member({ userId: 'u1', kind: 'OWNER', timeoutUntil: '2026-09-15T12:10:00.000Z' }),
    ]);

    expect(activeTimeoutUntil(expired, 'u1', now)).toBeNull();
    expect(activeTimeoutUntil(owner, 'u1', now)).toBeNull();
  });
});
