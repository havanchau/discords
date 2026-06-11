import type { Channel, Role, ServerDetail } from '../api';
import { PERMISSION_OPTIONS } from '../helpers';

export interface PermissionPreviewAction {
  value: string;
  label: string;
  allowed: boolean;
}

export interface PermissionPreviewChannel {
  channel: Channel;
  canView: boolean;
  actions: PermissionPreviewAction[];
}

export function buildRolePermissionPreview(role: Role, channels: Channel[]): PermissionPreviewChannel[] {
  return channels.map((channel) => ({
    channel,
    canView: role.permissions.includes('VIEW_CHANNEL'),
    actions: PERMISSION_OPTIONS.map((permission) => ({
      ...permission,
      allowed: role.permissions.includes(permission.value),
    })),
  }));
}

export function buildMemberPermissionPreview(
  member: ServerDetail['members'][number],
  channels: Channel[],
): PermissionPreviewChannel[] {
  const permissions = new Set(
    member.kind === 'OWNER'
      ? PERMISSION_OPTIONS.map((permission) => permission.value)
      : member.roles?.flatMap(({ role }) => role.permissions) ?? [],
  );

  return channels.map((channel) => ({
    channel,
    canView: permissions.has('VIEW_CHANNEL'),
    actions: PERMISSION_OPTIONS.map((permission) => ({
      ...permission,
      allowed: permissions.has(permission.value),
    })),
  }));
}
