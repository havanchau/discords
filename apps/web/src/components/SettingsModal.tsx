import { Check, ChevronDown, Hash, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { FormEvent, RefObject, useState } from 'react';
import {
  assetUrl,
  AuditLogEntry,
  AuthState,
  Channel,
  ChannelPermissionOverride,
  NotificationPreference,
  Role,
  ServerDetail,
} from '../api';
import { accentClass, initials, PERMISSION_OPTIONS } from '../helpers';
import { ActiveDialog } from './ChatPanel';
import {
  Button,
  DialogContent,
  DialogRoot,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  TextArea,
  TextField,
} from './ui';

interface SettingsSelectOption<T extends string> {
  value: T;
  label: string;
}

interface SettingsSelectProps<T extends string> {
  name: string;
  label: string;
  defaultValue: T;
  options: SettingsSelectOption<T>[];
  onValueChange?: (value: T) => void;
}

function SettingsSelect<T extends string>({
  name,
  label,
  defaultValue,
  options,
  onValueChange,
}: SettingsSelectProps<T>) {
  const [value, setValue] = useState(defaultValue);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type="hidden" name={name} value={value} />
      <DropdownMenuRoot>
        <DropdownMenuTrigger asChild>
          <button type="button" className="settings-select-trigger" aria-label={label}>
            <span>{selected?.label}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="settings-select-menu">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                setValue(option.value);
                onValueChange?.(option.value);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} aria-hidden="true" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </label>
  );
}

const STATUS_OPTIONS: SettingsSelectOption<'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE'>[] = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'IDLE', label: 'Idle' },
  { value: 'DND', label: 'Do Not Disturb' },
  { value: 'INVISIBLE', label: 'Invisible' },
];

const THEME_OPTIONS: SettingsSelectOption<'dark' | 'midnight' | 'slate' | 'oled'>[] = [
  { value: 'dark', label: 'Discord dark' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'slate', label: 'Slate' },
  { value: 'oled', label: 'OLED' },
];

interface SettingsModalProps {
  activeDialog: ActiveDialog;
  auth: AuthState;
  server: ServerDetail | null;
  channel: Channel | null;
  selectedMember: ServerDetail['members'][number] | null;
  channelOverrides: ChannelPermissionOverride[];
  auditLogs: AuditLogEntry[];
  notificationPreferences: NotificationPreference[];
  pendingAction: string | null;
  uiTheme: 'dark' | 'midnight' | 'slate' | 'oled';
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  channelAvatarInputRef: RefObject<HTMLInputElement | null>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  updateProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
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
  createRole: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleRolePermission: (role: Role, permission: string, enabled: boolean) => Promise<void>;
  deleteRole: (role: Role) => Promise<void>;
  toggleMemberRole: (memberId: string, roleId: string, enabled: boolean) => Promise<void>;
  setUiTheme: (theme: 'dark' | 'midnight' | 'slate' | 'oled') => void;
}

export function SettingsModal({
  activeDialog,
  auth,
  server,
  channel,
  selectedMember,
  channelOverrides,
  auditLogs,
  notificationPreferences,
  pendingAction,
  uiTheme,
  profileAvatarInputRef,
  channelAvatarInputRef,
  setActiveDialog,
  updateProfile,
  updateNotificationPreference,
  updateServerSettings,
  updateChannelSettings,
  toggleChannelRoleOverride,
  createRole,
  toggleRolePermission,
  deleteRole,
  toggleMemberRole,
  setUiTheme,
}: SettingsModalProps) {
  const globalNotificationPreference = notificationPreferences.find(
    (preference) => !preference.serverId && !preference.channelId,
  );
  const title =
    activeDialog === 'profile'
      ? 'Edit profile'
      : activeDialog === 'server-settings'
        ? 'Server settings'
        : activeDialog === 'channel-settings'
          ? 'Channel settings'
          : activeDialog === 'roles'
            ? 'Roles'
            : 'Member roles';

  return (
    <DialogRoot
      open={Boolean(activeDialog)}
      onOpenChange={(open) => !open && setActiveDialog(null)}
    >
      <DialogContent
        title={title}
        description="Tune profile, server, channel, role, and notification preferences."
        className={`settings-modal ${activeDialog === 'roles' ? 'roles-modal' : ''}`}
        bodyClassName="settings-modal-body"
      >
        {activeDialog === 'profile' ? (
          <form className="settings-form" onSubmit={updateProfile}>
            <section className="settings-section">
              <div className="settings-section-heading">
                <strong>Profile</strong>
                <span>How other members see you across servers.</span>
              </div>
              <div className="settings-avatar-row">
                <button
                  type="button"
                  className="avatar-button modal-avatar"
                  onClick={() => profileAvatarInputRef.current?.click()}
                >
                  {auth.user.avatarUrl ? (
                    <img src={assetUrl(auth.user.avatarUrl)} alt={auth.user.displayName} />
                  ) : (
                    <span className={`avatar ${accentClass(auth.user.id)}`}>
                      {initials(auth.user.displayName)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="wide-command"
                  onClick={() => profileAvatarInputRef.current?.click()}
                >
                  Change avatar
                </button>
              </div>
              <TextField
                label="Display name"
                name="displayName"
                defaultValue={auth.user.displayName}
                maxLength={64}
                required
              />
              <TextArea
                label="Bio"
                name="bio"
                defaultValue={auth.user.bio ?? ''}
                maxLength={280}
                placeholder="Short profile note"
              />
            </section>

            <section className="settings-section">
              <div className="settings-section-heading">
                <strong>Account</strong>
                <span>Identity and presence controls.</span>
              </div>
              <div className="settings-grid">
                <TextField
                  label="Username"
                  value={auth.user.username}
                  readOnly
                  className="readonly-input"
                />
                <TextField
                  label="Email"
                  value={auth.user.email}
                  readOnly
                  className="readonly-input"
                />
              </div>
              <SettingsSelect
                name="status"
                label="Status"
                defaultValue={auth.user.status ?? 'ONLINE'}
                options={STATUS_OPTIONS}
              />
              <SettingsSelect
                name="uiTheme"
                label="App theme"
                defaultValue={uiTheme}
                options={THEME_OPTIONS}
                onValueChange={setUiTheme}
              />
              <div className="profile-preview">
                <div className={`avatar small ${accentClass(auth.user.id)}`}>
                  {auth.user.avatarUrl ? (
                    <img src={assetUrl(auth.user.avatarUrl)} alt={auth.user.displayName} />
                  ) : (
                    initials(auth.user.displayName)
                  )}
                </div>
                <div>
                  <strong>{auth.user.displayName}</strong>
                  <span>@{auth.user.username}</span>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section-heading">
                <strong>Notifications</strong>
                <span>Global delivery preferences for this browser session.</span>
              </div>
              <label className="switch-row">
                <span>
                  <strong>Mute notifications</strong>
                  <small>Keep unread badges, but silence non-critical notifications.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(globalNotificationPreference?.muted)}
                  disabled={pendingAction === 'notification-preference'}
                  onChange={(event) =>
                    void updateNotificationPreference({
                      serverId: null,
                      channelId: null,
                      muted: event.currentTarget.checked,
                      mentionOnly: Boolean(globalNotificationPreference?.mentionOnly),
                      desktopEnabled: Boolean(globalNotificationPreference?.desktopEnabled),
                    })
                  }
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>Mentions only</strong>
                  <small>Only surface notifications that mention you directly.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(globalNotificationPreference?.mentionOnly)}
                  disabled={pendingAction === 'notification-preference'}
                  onChange={(event) =>
                    void updateNotificationPreference({
                      serverId: null,
                      channelId: null,
                      muted: Boolean(globalNotificationPreference?.muted),
                      mentionOnly: event.currentTarget.checked,
                      desktopEnabled: Boolean(globalNotificationPreference?.desktopEnabled),
                    })
                  }
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>Desktop notifications</strong>
                  <small>Store consent preference for future browser notifications.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(globalNotificationPreference?.desktopEnabled)}
                  disabled={pendingAction === 'notification-preference'}
                  onChange={(event) =>
                    void updateNotificationPreference({
                      serverId: null,
                      channelId: null,
                      muted: Boolean(globalNotificationPreference?.muted),
                      mentionOnly: Boolean(globalNotificationPreference?.mentionOnly),
                      desktopEnabled: event.currentTarget.checked,
                    })
                  }
                />
              </label>
            </section>
            <footer className="settings-modal-footer">
              <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
                Cancel
              </Button>
              <button
                className="primary compact-primary"
                disabled={pendingAction === 'profile-update'}
              >
                Save changes
              </button>
            </footer>
          </form>
        ) : null}

        {activeDialog === 'server-settings' && server ? (
          <form className="settings-form" onSubmit={updateServerSettings}>
            <button
              type="button"
              className="wide-command settings-secondary-action"
              onClick={() => setActiveDialog('roles')}
            >
              Manage roles and permissions
            </button>
            <TextField
              label="Server name"
              name="name"
              defaultValue={server.name}
              minLength={2}
              maxLength={80}
              required
            />
            <TextField
              label="Description"
              name="description"
              defaultValue={server.description ?? ''}
              maxLength={200}
            />
            <footer className="settings-modal-footer">
              <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
                Cancel
              </Button>
              <button
                className="primary compact-primary"
                disabled={pendingAction === 'server-update'}
              >
                Save changes
              </button>
            </footer>
            <section className="settings-section audit-section">
              <div className="settings-section-heading">
                <strong>Audit log</strong>
                <span>Recent moderation and configuration changes.</span>
              </div>
              <div className="audit-log-list">
                {auditLogs.length ? (
                  auditLogs.slice(0, 8).map((log) => (
                    <div className="audit-log-row" key={log.id}>
                      <span>{log.action.replaceAll('_', ' ').toLowerCase()}</span>
                      <small>
                        {log.actor?.displayName ?? 'System'} ·{' '}
                        {new Date(log.createdAt).toLocaleString()}
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="empty-note">No audit events yet.</p>
                )}
              </div>
            </section>
          </form>
        ) : null}

        {activeDialog === 'channel-settings' && channel ? (
          <form className="settings-form" onSubmit={updateChannelSettings}>
            <section className="settings-section">
              <div className="settings-section-heading">
                <strong>Overview</strong>
                <span>Basic channel identity and placement.</span>
              </div>
              <div className="settings-avatar-row">
                <button
                  type="button"
                  className="channel-avatar-button modal-avatar"
                  onClick={() => channelAvatarInputRef.current?.click()}
                >
                  {channel.avatarUrl ? (
                    <img src={assetUrl(channel.avatarUrl)} alt={channel.name} />
                  ) : (
                    <Hash size={24} />
                  )}
                </button>
                <button
                  type="button"
                  className="wide-command"
                  onClick={() => channelAvatarInputRef.current?.click()}
                >
                  Change channel avatar
                </button>
              </div>
              <div className="settings-grid">
                <TextField
                  label="Channel name"
                  name="name"
                  defaultValue={channel.name}
                  maxLength={80}
                  required
                />
                <TextField
                  label="Position"
                  name="position"
                  type="number"
                  min={0}
                  defaultValue={channel.position ?? 0}
                />
              </div>
              <TextArea
                label="Topic"
                name="topic"
                defaultValue={channel.topic ?? ''}
                maxLength={200}
              />
            </section>

            <section className="settings-section">
              <div className="settings-section-heading">
                <strong>Access</strong>
                <span>Control channel visibility for regular members.</span>
              </div>
              <label className="switch-row">
                <span>
                  <strong>Private channel</strong>
                  <small>Hide this channel from members without view permission.</small>
                </span>
                <input
                  name="isPrivate"
                  type="checkbox"
                  defaultChecked={Boolean(channel.isPrivate)}
                />
              </label>
              <TextField
                label="Channel type"
                value={channel.type === 'VOICE' ? 'Voice channel' : 'Text channel'}
                readOnly
                className="readonly-input"
              />
            </section>

            {server ? (
              <section className="settings-section">
                <div className="settings-section-heading">
                  <strong>Role overrides</strong>
                  <span>Grant specific roles access to private or restricted channels.</span>
                </div>
                <div className="permission-override-list">
                  {server.roles.map((role) => {
                    const override = channelOverrides.find((item) => item.roleId === role.id);
                    const canView = Boolean(override?.allow.includes('VIEW_CHANNEL'));
                    const canSend = Boolean(override?.allow.includes('SEND_MESSAGES'));
                    return (
                      <div className="permission-override-row" key={role.id}>
                        <div>
                          <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                          <span>{role.name === '@everyone' ? 'Default role' : 'Role access'}</span>
                        </div>
                        <label className="mini-check">
                          <input
                            type="checkbox"
                            checked={canView}
                            disabled={pendingAction?.startsWith(`channel-override-${role.id}`)}
                            onChange={(event) =>
                              void toggleChannelRoleOverride(
                                role.id,
                                'VIEW_CHANNEL',
                                event.currentTarget.checked,
                              )
                            }
                          />
                          View
                        </label>
                        <label className="mini-check">
                          <input
                            type="checkbox"
                            checked={canSend}
                            disabled={pendingAction?.startsWith(`channel-override-${role.id}`)}
                            onChange={(event) =>
                              void toggleChannelRoleOverride(
                                role.id,
                                'SEND_MESSAGES',
                                event.currentTarget.checked,
                              )
                            }
                          />
                          Send
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <footer className="settings-modal-footer">
              <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
                Cancel
              </Button>
              <button
                className="primary compact-primary"
                disabled={pendingAction === 'channel-update'}
              >
                Save changes
              </button>
            </footer>
          </form>
        ) : null}

        {activeDialog === 'roles' && server ? (
          <div className="settings-form roles-shell">
            <form className="role-create-form" onSubmit={createRole}>
              <div className="role-create-header">
                <span className="role-create-icon">
                  <Plus size={18} />
                </span>
                <div>
                  <strong>Create role</strong>
                  <span>{PERMISSION_OPTIONS.length} permissions available</span>
                </div>
              </div>
              <div className="role-create-fields">
                <label className="role-field">
                  Role name
                  <input name="name" placeholder="Moderator" maxLength={50} required />
                </label>
                <label className="role-field role-color-field">
                  Color
                  <span className="role-color-input">
                    <span className="role-color-preview" />
                    <input name="color" placeholder="#5865F2" maxLength={24} />
                  </span>
                </label>
              </div>
              <div className="permission-grid role-permission-palette">
                {PERMISSION_OPTIONS.map((permission) => (
                  <label key={permission.value} className="check-row permission-tile">
                    <input name="permissions" type="checkbox" value={permission.value} />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
              <button
                className="primary compact-primary role-create-submit"
                disabled={pendingAction === 'role-create'}
              >
                Create role
              </button>
            </form>

            <div className="role-list">
              {server.roles.map((role) => {
                const isEveryone = role.name === '@everyone';
                return (
                  <section key={role.id} className="role-editor">
                    <div className="role-editor-header">
                      <div className="role-identity">
                        <span
                          className="role-color-dot"
                          style={{ backgroundColor: role.color || undefined }}
                        >
                          {!role.color ? <ShieldCheck size={14} /> : null}
                        </span>
                        <div>
                          <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                          <span>
                            {isEveryone
                              ? 'Default server role'
                              : `${role.permissions.length} permissions`}
                          </span>
                        </div>
                      </div>
                      {!isEveryone ? (
                        <button
                          type="button"
                          className="danger-icon"
                          title="Delete role"
                          onClick={() => void deleteRole(role)}
                          disabled={pendingAction === `role-${role.id}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                    <div className="permission-grid">
                      {PERMISSION_OPTIONS.map((permission) => (
                        <label key={permission.value} className="check-row permission-toggle">
                          <input
                            type="checkbox"
                            checked={role.permissions.includes(permission.value)}
                            disabled={isEveryone || pendingAction === `role-${role.id}`}
                            onChange={(event) =>
                              void toggleRolePermission(
                                role,
                                permission.value,
                                event.currentTarget.checked,
                              )
                            }
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeDialog === 'member-roles' && server && selectedMember ? (
          <div className="settings-form">
            <div className="member-role-summary">
              <div className={`avatar ${accentClass(selectedMember.user.id)}`}>
                {selectedMember.user.avatarUrl ? (
                  <img
                    src={assetUrl(selectedMember.user.avatarUrl)}
                    alt={selectedMember.user.displayName}
                  />
                ) : (
                  initials(selectedMember.user.displayName)
                )}
              </div>
              <div>
                <strong>{selectedMember.user.displayName}</strong>
                <span>
                  {selectedMember.kind === 'OWNER'
                    ? 'Owner'
                    : selectedMember.user.status || 'Member'}
                </span>
              </div>
            </div>
            <div className="role-list">
              {server.roles.map((role) => {
                const isEveryone = role.name === '@everyone';
                const hasRole = Boolean(
                  selectedMember.roles?.some((item) => item.role.id === role.id),
                );
                return (
                  <label key={role.id} className="check-row role-assign-row">
                    <input
                      type="checkbox"
                      checked={hasRole}
                      disabled={
                        isEveryone ||
                        selectedMember.kind === 'OWNER' ||
                        pendingAction === `member-role-${selectedMember.id}-${role.id}`
                      }
                      onChange={(event) =>
                        void toggleMemberRole(
                          selectedMember.id,
                          role.id,
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span style={{ color: role.color || undefined }}>{role.name}</span>
                    <small>
                      {isEveryone
                        ? 'Default'
                        : role.permissions.length
                          ? `${role.permissions.length} permissions`
                          : 'No permissions'}
                    </small>
                  </label>
                );
              })}
            </div>
            <footer className="settings-modal-footer">
              <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
                Done
              </Button>
            </footer>
          </div>
        ) : null}
      </DialogContent>
    </DialogRoot>
  );
}
