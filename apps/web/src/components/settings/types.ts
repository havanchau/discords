import type { FormEvent, RefObject } from 'react';
import type {
  AuditLogEntry,
  AuthState,
  Channel,
  ChannelPermissionOverride,
  Invite,
  NotificationPreference,
  Role,
  ServerDetail,
} from '../../api';
import type { ActiveDialog } from '../ChatPanel';

export type UiTheme = 'dark' | 'midnight' | 'slate' | 'oled';

export interface SettingsSelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SettingsModalFields {
  activeDialog: ActiveDialog;
  auth: AuthState;
  server: ServerDetail | null;
  channel: Channel | null;
  selectedMember: ServerDetail['members'][number] | null;
  channelOverrides: ChannelPermissionOverride[];
  auditLogs: AuditLogEntry[];
  invites: Invite[];
  notificationPreferences: NotificationPreference[];
  pendingAction: string | null;
  uiTheme: UiTheme;
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  channelAvatarInputRef: RefObject<HTMLInputElement | null>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  updateProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createInviteFromSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  updateNotificationPreference: (
    preference: Partial<NotificationPreference> & {
      serverId?: string | null;
      channelId?: string | null;
    },
  ) => Promise<void>;
  updateServerSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateChannelSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleChannelRoleOverride: (
    roleId: string,
    permission: string,
    enabled: boolean,
  ) => Promise<void>;
  toggleChannelMemberOverride: (
    memberId: string,
    permission: string,
    disposition: 'allow' | 'deny',
    enabled: boolean,
  ) => Promise<void>;
  createRole: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleRolePermission: (role: Role, permission: string, enabled: boolean) => Promise<void>;
  deleteRole: (role: Role) => Promise<void>;
  toggleMemberRole: (memberId: string, roleId: string, enabled: boolean) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  openMemberRoleEditor: (memberId: string) => void;
  setUiTheme: (theme: UiTheme) => void;
}

export interface SettingsModalProps {
  dialog: Pick<SettingsModalFields, 'activeDialog' | 'setActiveDialog'>;
  data: Pick<
    SettingsModalFields,
    | 'auth'
    | 'server'
    | 'channel'
    | 'selectedMember'
    | 'channelOverrides'
    | 'auditLogs'
    | 'invites'
    | 'notificationPreferences'
    | 'pendingAction'
  >;
  refs: Pick<SettingsModalFields, 'profileAvatarInputRef' | 'channelAvatarInputRef'>;
  theme: Pick<SettingsModalFields, 'uiTheme'>;
  actions: Pick<
    SettingsModalFields,
    | 'setUiTheme'
    | 'createInviteFromSettings'
    | 'revokeInvite'
    | 'updateProfile'
    | 'updateNotificationPreference'
    | 'updateServerSettings'
    | 'updateChannelSettings'
    | 'toggleChannelRoleOverride'
    | 'toggleChannelMemberOverride'
    | 'createRole'
    | 'toggleRolePermission'
    | 'deleteRole'
    | 'toggleMemberRole'
    | 'removeMember'
    | 'openMemberRoleEditor'
  >;
}
