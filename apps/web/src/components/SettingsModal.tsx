import { Hash, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { FormEvent, RefObject } from 'react';
import { assetUrl, AuthState, Channel, Role, ServerDetail } from '../api';
import { accentClass, initials, PERMISSION_OPTIONS } from '../helpers';
import { ActiveDialog } from './ChatPanel';

interface SettingsModalProps {
  activeDialog: ActiveDialog;
  auth: AuthState;
  server: ServerDetail | null;
  channel: Channel | null;
  selectedMember: ServerDetail['members'][number] | null;
  pendingAction: string | null;
  uiTheme: 'dark' | 'midnight' | 'slate' | 'oled';
  profileAvatarInputRef: RefObject<HTMLInputElement | null>;
  channelAvatarInputRef: RefObject<HTMLInputElement | null>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  updateProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateServerSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateChannelSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
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
  pendingAction,
  uiTheme,
  profileAvatarInputRef,
  channelAvatarInputRef,
  setActiveDialog,
  updateProfile,
  updateServerSettings,
  updateChannelSettings,
  createRole,
  toggleRolePermission,
  deleteRole,
  toggleMemberRole,
  setUiTheme,
}: SettingsModalProps) {
  if (!activeDialog) return null;

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={() => setActiveDialog(null)}>
      <section
        className={`settings-modal ${activeDialog === 'roles' ? 'roles-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-modal-header">
          <strong>
            {activeDialog === 'profile'
              ? 'Edit profile'
              : activeDialog === 'server-settings'
                ? 'Server settings'
                : activeDialog === 'channel-settings'
                  ? 'Channel settings'
                  : activeDialog === 'roles'
                    ? 'Roles'
                    : 'Member roles'}
          </strong>
          <button type="button" title="Close" onClick={() => setActiveDialog(null)}>
            <X size={18} />
          </button>
        </header>

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
              <label>
                Display name
                <input
                  name="displayName"
                  defaultValue={auth.user.displayName}
                  maxLength={64}
                  required
                />
              </label>
              <label>
                Bio
                <textarea
                  name="bio"
                  defaultValue={auth.user.bio ?? ''}
                  maxLength={280}
                  placeholder="Short profile note"
                />
              </label>
            </section>

            <section className="settings-section">
              <div className="settings-section-heading">
                <strong>Account</strong>
                <span>Identity and presence controls.</span>
              </div>
              <div className="settings-grid">
                <label>
                  Username
                  <input value={auth.user.username} readOnly className="readonly-input" />
                </label>
                <label>
                  Email
                  <input value={auth.user.email} readOnly className="readonly-input" />
                </label>
              </div>
              <label>
                Status
                <select name="status" defaultValue={auth.user.status ?? 'ONLINE'}>
                  <option value="ONLINE">Online</option>
                  <option value="IDLE">Idle</option>
                  <option value="DND">Do Not Disturb</option>
                  <option value="INVISIBLE">Invisible</option>
                </select>
              </label>
              <label>
                App theme
                <select
                  name="uiTheme"
                  defaultValue={uiTheme}
                  onChange={(event) =>
                    setUiTheme(event.target.value as 'dark' | 'midnight' | 'slate' | 'oled')
                  }
                >
                  <option value="dark">Discord dark</option>
                  <option value="midnight">Midnight</option>
                  <option value="slate">Slate</option>
                  <option value="oled">OLED</option>
                </select>
              </label>
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
            <footer className="settings-modal-footer">
              <button type="button" className="ghost" onClick={() => setActiveDialog(null)}>
                Cancel
              </button>
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
            <label>
              Server name
              <input name="name" defaultValue={server.name} minLength={2} maxLength={80} required />
            </label>
            <label>
              Description
              <input name="description" defaultValue={server.description ?? ''} maxLength={200} />
            </label>
            <footer className="settings-modal-footer">
              <button type="button" className="ghost" onClick={() => setActiveDialog(null)}>
                Cancel
              </button>
              <button
                className="primary compact-primary"
                disabled={pendingAction === 'server-update'}
              >
                Save changes
              </button>
            </footer>
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
                <label>
                  Channel name
                  <input name="name" defaultValue={channel.name} maxLength={80} required />
                </label>
                <label>
                  Position
                  <input
                    name="position"
                    type="number"
                    min={0}
                    defaultValue={channel.position ?? 0}
                  />
                </label>
              </div>
              <label>
                Topic
                <textarea name="topic" defaultValue={channel.topic ?? ''} maxLength={200} />
              </label>
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
              <label>
                Channel type
                <input
                  value={channel.type === 'VOICE' ? 'Voice channel' : 'Text channel'}
                  readOnly
                  className="readonly-input"
                />
              </label>
            </section>
            <footer className="settings-modal-footer">
              <button type="button" className="ghost" onClick={() => setActiveDialog(null)}>
                Cancel
              </button>
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
              <button type="button" className="ghost" onClick={() => setActiveDialog(null)}>
                Done
              </button>
            </footer>
          </div>
        ) : null}
      </section>
    </div>
  );
}
