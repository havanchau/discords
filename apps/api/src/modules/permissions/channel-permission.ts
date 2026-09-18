export const Permission = {
  ViewChannel: 'VIEW_CHANNEL',
  SendMessages: 'SEND_MESSAGES',
  ManageMessages: 'MANAGE_MESSAGES',
  ManageChannels: 'MANAGE_CHANNELS',
  ManageServer: 'MANAGE_SERVER',
  ManageRoles: 'MANAGE_ROLES',
  KickMembers: 'KICK_MEMBERS',
  BanMembers: 'BAN_MEMBERS',
  CreateInvite: 'CREATE_INVITE',
  ConnectVoice: 'CONNECT_VOICE',
  SpeakVoice: 'SPEAK_VOICE',
  UploadFiles: 'UPLOAD_FILES',
  MuteMembers: 'MUTE_MEMBERS',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

export interface PermissionMember {
  id: string;
  kind: string;
  roles: Array<{ roleId: string; role: { permissions: string[] } }>;
}

export interface PermissionChannel {
  id: string;
  isPrivate: boolean;
}

export interface PermissionOverride {
  channelId: string;
  roleId: string | null;
  memberId: string | null;
  allow: string[];
  deny: string[];
}

export function memberHasRolePermission(member: PermissionMember, permission: PermissionValue) {
  return member.roles.some(({ role }) => role.permissions.includes(permission));
}

/*
 * Single source of truth for channel access. Batch callers load members, roles and overrides once
 * and evaluate many channels here, so this must stay free of I/O.
 * `overrides` may contain rows for other channels or members; they are ignored.
 */
export function evaluateChannelPermission(input: {
  member: PermissionMember | null | undefined;
  channel: PermissionChannel;
  overrides: PermissionOverride[];
  permission: PermissionValue;
}) {
  const { member, channel, overrides, permission } = input;
  if (!member) return false;
  if (member.kind === 'OWNER') return true;

  let allowed: boolean;
  if (permission === Permission.ViewChannel && channel.isPrivate) {
    if (memberHasRolePermission(member, Permission.ManageChannels)) return true;
    allowed = false;
  } else {
    allowed = memberHasRolePermission(member, permission);
  }

  const roleIds = new Set(member.roles.map(({ roleId }) => roleId));
  const channelOverrides = overrides.filter((override) => override.channelId === channel.id);

  for (const override of channelOverrides) {
    if (!override.roleId || !roleIds.has(override.roleId)) continue;
    if (override.deny.includes(permission)) allowed = false;
    if (override.allow.includes(permission)) allowed = true;
  }

  const memberOverride = channelOverrides.find((override) => override.memberId === member.id);
  if (memberOverride?.deny.includes(permission)) allowed = false;
  if (memberOverride?.allow.includes(permission)) allowed = true;

  return allowed;
}
