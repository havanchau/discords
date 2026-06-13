import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Permission, PermissionsService } from './permissions.service';

type MockRole = {
  id: string;
  permissions: string[];
};

type MockOverride = {
  roleId?: string | null;
  memberId?: string | null;
  allow: string[];
  deny: string[];
};

function createPermissionsService(input: {
  channel?: { id: string; serverId: string; isPrivate?: boolean };
  member?: {
    id: string;
    userId: string;
    serverId: string;
    kind?: 'OWNER' | 'MEMBER';
    roles?: MockRole[];
  };
  overrides?: MockOverride[];
}) {
  const channel = input.channel ?? { id: 'channel-1', serverId: 'server-1', isPrivate: false };
  const member = input.member ?? {
    id: 'member-1',
    userId: 'user-1',
    serverId: channel.serverId,
    kind: 'MEMBER' as const,
    roles: [],
  };
  const overrides = input.overrides ?? [];
  const prisma = {
    channel: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === channel.id ? channel : null,
    },
    serverMember: {
      findUnique: async ({
        where,
      }: {
        where: { userId_serverId: { userId: string; serverId: string } };
      }) => {
        if (
          where.userId_serverId.userId !== member.userId ||
          where.userId_serverId.serverId !== member.serverId
        ) {
          return null;
        }

        return {
          ...member,
          kind: member.kind ?? 'MEMBER',
          roles: (member.roles ?? []).map((role) => ({ roleId: role.id, role })),
        };
      },
    },
    channelPermissionOverride: {
      findMany: async () => overrides,
    },
  };

  return new PermissionsService(prisma as never);
}

describe('PermissionsService channel overrides', () => {
  it('lets owner members bypass channel override checks', async () => {
    const service = createPermissionsService({
      member: {
        id: 'owner-member',
        userId: 'owner',
        serverId: 'server-1',
        kind: 'OWNER',
        roles: [],
      },
      overrides: [{ memberId: 'owner-member', allow: [], deny: [Permission.SendMessages] }],
    });

    await assert.doesNotReject(() =>
      service.requireChannelPermission('owner', 'channel-1', Permission.SendMessages),
    );
  });

  it('applies role denies after server-level role permissions', async () => {
    const service = createPermissionsService({
      member: {
        id: 'member-1',
        userId: 'user-1',
        serverId: 'server-1',
        roles: [{ id: 'role-1', permissions: [Permission.SendMessages] }],
      },
      overrides: [{ roleId: 'role-1', allow: [], deny: [Permission.SendMessages] }],
    });

    assert.equal(await service.hasChannelPermission('user-1', 'channel-1', Permission.SendMessages), false);
  });

  it('lets member-level allow override role-level deny for private channel view', async () => {
    const service = createPermissionsService({
      channel: { id: 'channel-1', serverId: 'server-1', isPrivate: true },
      member: {
        id: 'member-1',
        userId: 'user-1',
        serverId: 'server-1',
        roles: [{ id: 'role-1', permissions: [Permission.ViewChannel] }],
      },
      overrides: [
        { roleId: 'role-1', allow: [], deny: [Permission.ViewChannel] },
        { memberId: 'member-1', allow: [Permission.ViewChannel], deny: [] },
      ],
    });

    assert.equal(await service.hasChannelPermission('user-1', 'channel-1', Permission.ViewChannel), true);
  });

  it('lets channel managers view private channels without explicit overrides', async () => {
    const service = createPermissionsService({
      channel: { id: 'channel-1', serverId: 'server-1', isPrivate: true },
      member: {
        id: 'member-1',
        userId: 'user-1',
        serverId: 'server-1',
        roles: [{ id: 'role-1', permissions: [Permission.ManageChannels] }],
      },
    });

    assert.equal(await service.hasChannelPermission('user-1', 'channel-1', Permission.ViewChannel), true);
  });
});
