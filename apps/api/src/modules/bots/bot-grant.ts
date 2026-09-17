import {
  evaluateChannelPermission,
  Permission,
  type PermissionChannel,
  type PermissionMember,
  type PermissionOverride,
  type PermissionValue,
} from '@/modules/permissions/channel-permission';

/** What the installer holds in one server, loaded once and evaluated in memory for every role. */
export interface InstallerGrantContext {
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
 * Whether an installer may give a bot these roles without escalating: every server-level permission
 * of the roles must be one the installer holds, and every channel override that allows something to
 * those roles must allow only what the installer already has in that channel. The owner may grant
 * anything. Pure, so the authorize dialog and the authorize call apply the exact same rule.
 */
export function installerCanGrant(context: InstallerGrantContext, roles: GrantableRole[]) {
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
