import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateChannelPermission,
  Permission,
  PermissionMember,
  PermissionOverride,
} from './channel-permission';

const publicChannel = { id: 'channel-public', isPrivate: false };
const privateChannel = { id: 'channel-private', isPrivate: true };

function member(permissionsByRole: Record<string, string[]>, kind = 'MEMBER'): PermissionMember {
  return {
    id: 'member-1',
    kind,
    roles: Object.entries(permissionsByRole).map(([roleId, permissions]) => ({
      roleId,
      role: { permissions },
    })),
  };
}

function override(
  partial: Partial<PermissionOverride> & { channelId: string },
): PermissionOverride {
  return { roleId: null, memberId: null, allow: [], deny: [], ...partial };
}

describe('evaluateChannelPermission', () => {
  it('denies when the user is not a member of the server', () => {
    const allowed = evaluateChannelPermission({
      member: null,
      channel: publicChannel,
      overrides: [],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, false);
  });

  it('allows the owner even when a member override denies', () => {
    const allowed = evaluateChannelPermission({
      member: member({}, 'OWNER'),
      channel: privateChannel,
      overrides: [
        override({ channelId: privateChannel.id, memberId: 'member-1', deny: ['VIEW_CHANNEL'] }),
      ],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, true);
  });

  it('allows a public channel when a role grants the permission', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: ['VIEW_CHANNEL'] }),
      channel: publicChannel,
      overrides: [],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, true);
  });

  it('denies a public channel when no role grants the permission', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: ['SEND_MESSAGES'] }),
      channel: publicChannel,
      overrides: [],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, false);
  });

  it('hides a private channel from a role that only has VIEW_CHANNEL', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: ['VIEW_CHANNEL'] }),
      channel: privateChannel,
      overrides: [],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, false);
  });

  it('shows a private channel to a role with MANAGE_CHANNELS', () => {
    const allowed = evaluateChannelPermission({
      member: member({ mods: ['MANAGE_CHANNELS'] }),
      channel: privateChannel,
      overrides: [],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, true);
  });

  it('shows a private channel when a role override allows it', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: [], team: [] }),
      channel: privateChannel,
      overrides: [
        override({ channelId: privateChannel.id, roleId: 'team', allow: ['VIEW_CHANNEL'] }),
      ],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, true);
  });

  it('ignores overrides for roles the member does not have', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: [] }),
      channel: privateChannel,
      overrides: [
        override({ channelId: privateChannel.id, roleId: 'team', allow: ['VIEW_CHANNEL'] }),
      ],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, false);
  });

  it('ignores overrides that belong to another channel', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: ['VIEW_CHANNEL'] }),
      channel: publicChannel,
      overrides: [override({ channelId: 'other', roleId: 'everyone', deny: ['VIEW_CHANNEL'] })],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, true);
  });

  it('lets a member allow override win over a role deny override', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: ['VIEW_CHANNEL'] }),
      channel: publicChannel,
      overrides: [
        override({ channelId: publicChannel.id, roleId: 'everyone', deny: ['VIEW_CHANNEL'] }),
        override({ channelId: publicChannel.id, memberId: 'member-1', allow: ['VIEW_CHANNEL'] }),
      ],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, true);
  });

  it('lets a member deny override win over a role grant', () => {
    const allowed = evaluateChannelPermission({
      member: member({ everyone: ['VIEW_CHANNEL'] }),
      channel: publicChannel,
      overrides: [
        override({ channelId: publicChannel.id, memberId: 'member-1', deny: ['VIEW_CHANNEL'] }),
      ],
      permission: Permission.ViewChannel,
    });

    assert.equal(allowed, false);
  });

  it('applies role overrides in order, the later one winning', () => {
    const allowed = evaluateChannelPermission({
      member: member({ a: ['SEND_MESSAGES'], b: [] }),
      channel: publicChannel,
      overrides: [
        override({ channelId: publicChannel.id, roleId: 'a', allow: ['SEND_MESSAGES'] }),
        override({ channelId: publicChannel.id, roleId: 'b', deny: ['SEND_MESSAGES'] }),
      ],
      permission: Permission.SendMessages,
    });

    assert.equal(allowed, false);
  });
});
