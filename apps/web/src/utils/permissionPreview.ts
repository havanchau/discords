import type { Channel, Role, ServerDetail } from '../api';
import { PERMISSION_VALUES } from '../helpers';
import type { Translate } from '../i18n/LocaleProvider';

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

export function buildRolePermissionPreview(
  role: Role,
  channels: Channel[],
  t: Translate,
): PermissionPreviewChannel[] {
  return channels.map((channel) => ({
    channel,
    canView: role.permissions.includes('VIEW_CHANNEL'),
    actions: PERMISSION_VALUES.map((permission) => ({
      value: permission,
      label: t(`permission.${permission}`),
      allowed: role.permissions.includes(permission),
    })),
  }));
}

export function buildMemberPermissionPreview(
  member: ServerDetail['members'][number],
  channels: Channel[],
  t: Translate,
): PermissionPreviewChannel[] {
  const permissions = new Set(
    member.kind === 'OWNER'
      ? [...PERMISSION_VALUES]
      : member.roles?.flatMap(({ role }) => role.permissions) ?? [],
  );

  return channels.map((channel) => ({
    channel,
    canView: permissions.has('VIEW_CHANNEL'),
    actions: PERMISSION_VALUES.map((permission) => ({
      value: permission,
      label: t(`permission.${permission}`),
      allowed: permissions.has(permission),
    })),
  }));
}
