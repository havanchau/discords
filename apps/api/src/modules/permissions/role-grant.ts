import { Prisma } from '@prisma/client';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import {
  evaluateChannelPermission,
  Permission,
  type PermissionChannel,
  type PermissionMember,
  type PermissionOverride,
  type PermissionValue,
} from './channel-permission';

export const granterMemberInclude = {
  roles: { include: { role: true } },
} satisfies Prisma.ServerMemberInclude;

export type GranterMember = Prisma.ServerMemberGetPayload<{ include: typeof granterMemberInclude }>;

/** What the granter holds in one server, loaded once and evaluated in memory for every role. */
export interface RoleGrantContext {
  member: PermissionMember;
  /** Union of the installer's role permissions; unused for an owner, who holds everything. */
  permissions: Set<string>;
  channels: PermissionChannel[];
  overrides: PermissionOverride[];
}

export interface GrantableRole {
  id: string;
  permissions: string[];
}

const KNOWN_PERMISSIONS = new Set<string>(Object.values(Permission));

function isPermissionValue(permission: string): permission is PermissionValue {
  return KNOWN_PERMISSIONS.has(permission);
}

/**
 * Whether a member may hand out these roles without escalating, to a bot or to a person: every
 * server-level permission of the roles must be one the granter holds, and every channel override that
 * allows something to those roles must allow only what the granter already has in that channel. The
 * owner may grant anything. Pure, so a dialog and the API call apply the exact same rule.
 */
export function canGrantRoles(context: RoleGrantContext, roles: GrantableRole[]) {
  if (context.member.kind === 'OWNER') return true;

  const roleIds = new Set(roles.map((role) => role.id));
  const serverLevel = roles.every((role) =>
    role.permissions.every((permission) => context.permissions.has(permission)),
  );
  if (!serverLevel) return false;

  const channelById = new Map(context.channels.map((channel) => [channel.id, channel]));
  return context.overrides
    .filter((override) => override.roleId !== null && roleIds.has(override.roleId))
    .every((override) => {
      const channel = channelById.get(override.channelId);
      if (!channel) return true;
      return override.allow.every((permission) =>
        isPermissionValue(permission)
          ? evaluateChannelPermission({
              member: context.member,
              channel,
              overrides: context.overrides,
              permission,
            })
          : context.permissions.has(permission),
      );
    });
}

/** Loads what `canGrantRoles` evaluates for a member loaded with `granterMemberInclude`. */
export async function loadRoleGrantContext(
  prisma: PrismaService,
  member: GranterMember,
): Promise<RoleGrantContext> {
  const channels = await prisma.channel.findMany({
    where: { serverId: member.serverId },
    select: { id: true, isPrivate: true },
  });
  const overrides = await prisma.channelPermissionOverride.findMany({
    where: { channelId: { in: channels.map((channel) => channel.id) } },
    select: { channelId: true, roleId: true, memberId: true, allow: true, deny: true },
    orderBy: { createdAt: 'asc' },
  });
  return {
    member,
    permissions: new Set(member.roles.flatMap(({ role }) => role.permissions)),
    channels,
    overrides,
  };
}
