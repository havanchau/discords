import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type {
  AuditLogEntry,
  AuthState,
  Channel,
  ChannelPermissionOverride,
  Invite,
  NotificationPreference,
  Role,
  ServerBanEntry,
  ServerDetail,
  ServerEmoji,
} from '@/api';
import type { ActiveDialog } from '@/components/ChatPanel';

import type { UiTheme } from '@/contexts/appContexts';

export type { UiTheme };

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
  auditLogsError: string | null;
  invites: Invite[];
  notificationPreferences: NotificationPreference[];
  pendingAction: string | null;
  bans: ServerBanEntry[];
  isLoadingBans: boolean;
  bansError: string | null;
  emojis: ServerEmoji[];
  isLoadingEmojis: boolean;
  emojisError: string | null;
  uiTheme: UiTheme;
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  profileBannerInputRef: RefObject<HTMLInputElement | null>;
  channelAvatarInputRef: RefObject<HTMLInputElement | null>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  updateProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateProfileBanner: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  updateServerProfile: (changes: {
    nickname?: string | null;
    avatarUrl?: string | null;
  }) => Promise<void>;
  updateServerProfileAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
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
  loadBans: (serverId: string) => Promise<void>;
  banMember: (userId: string, reason: string) => Promise<boolean>;
  unbanUser: (userId: string) => Promise<void>;
  timeoutMember: (memberId: string, durationMinutes: number) => Promise<void>;
  /** The three resolve to `null` on success, or the error message to show. */
  leaveServer: () => Promise<string | null>;
  transferOwnership: (userId: string, password: string, code: string) => Promise<string | null>;
  deleteServer: (password: string, code: string) => Promise<string | null>;
  createEmoji: (file: File, name: string) => Promise<boolean>;
  deleteEmoji: (emojiId: string) => Promise<void>;
  openMemberRoleEditor: (memberId: string) => void;
  setUiTheme: (theme: UiTheme) => void;
  signOut: () => void;
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
    | 'auditLogsError'
    | 'invites'
    | 'notificationPreferences'
    | 'pendingAction'
    | 'bans'
    | 'isLoadingBans'
    | 'bansError'
    | 'emojis'
    | 'isLoadingEmojis'
    | 'emojisError'
  >;
  refs: Pick<
    SettingsModalFields,
    'profileAvatarInputRef' | 'profileBannerInputRef' | 'channelAvatarInputRef'
  >;
  theme: Pick<SettingsModalFields, 'uiTheme'>;
  actions: Pick<
    SettingsModalFields,
    | 'setUiTheme'
    | 'signOut'
    | 'createInviteFromSettings'
    | 'revokeInvite'
    | 'updateProfile'
    | 'updateProfileBanner'
    | 'updateServerProfile'
    | 'updateServerProfileAvatar'
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
    | 'loadBans'
    | 'banMember'
    | 'unbanUser'
    | 'timeoutMember'
    | 'leaveServer'
    | 'transferOwnership'
    | 'deleteServer'
    | 'createEmoji'
    | 'deleteEmoji'
    | 'openMemberRoleEditor'
  >;
}
