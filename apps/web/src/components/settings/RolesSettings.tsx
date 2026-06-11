import { useState } from 'react';
import { ChevronRight, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { assetUrl } from '../../api';
import { accentClass, initials, PERMISSION_OPTIONS } from '../../helpers';
import { Avatar, Badge, Button, IconButton, TextField } from '../ui';
import { buildMemberPermissionPreview, buildRolePermissionPreview } from '../../utils/permissionPreview';
import { CheckRow } from './SettingsRows';
import type { SettingsModalFields } from './types';

type RolesSettingsProps = Pick<
  SettingsModalFields,
  | 'createRole'
  | 'deleteRole'
  | 'openMemberRoleEditor'
  | 'pendingAction'
  | 'selectedMember'
  | 'server'
  | 'toggleRolePermission'
>;

export function RolesSettings({
  createRole,
  deleteRole,
  openMemberRoleEditor,
  pendingAction,
  selectedMember,
  server,
  toggleRolePermission,
}: RolesSettingsProps) {
  const [previewRoleId, setPreviewRoleId] = useState<string | null>(null);
  const [previewMemberId, setPreviewMemberId] = useState<string | null>(null);
  const [previewChannelFilter, setPreviewChannelFilter] = useState('');

  if (!server) return null;

  const previewRole = server.roles.find((role) => role.id === (previewRoleId ?? server.roles[0]?.id));
  const previewMember = server.members.find((member) => member.id === previewMemberId);
  const filteredPreviewChannels = server.channels.filter((channel) =>
    channel.name.toLowerCase().includes(previewChannelFilter.trim().toLowerCase()),
  );
  const previewRows = previewMember
    ? buildMemberPermissionPreview(previewMember, filteredPreviewChannels)
    : previewRole
      ? buildRolePermissionPreview(previewRole, filteredPreviewChannels)
      : [];

  const members = [...server.members].sort((left, right) => {
    if (left.kind === 'OWNER' && right.kind !== 'OWNER') return -1;
    if (left.kind !== 'OWNER' && right.kind === 'OWNER') return 1;
    return left.user.displayName.localeCompare(right.user.displayName);
  });

  return (
    <div className="settings-form roles-shell">
      <form className="role-create-form" onSubmit={createRole}>
        <div className="role-create-header">
          <span className="role-create-icon">
            <Plus size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Create role</strong>
            <span>{PERMISSION_OPTIONS.length} permissions available</span>
          </div>
        </div>
        <div className="role-create-fields">
          <TextField label="Role name" name="name" placeholder="Moderator" maxLength={50} required />
          <TextField label="Color" name="color" placeholder="#5865F2" maxLength={24} />
        </div>
        <div className="permission-grid role-permission-palette">
          {PERMISSION_OPTIONS.map((permission) => (
            <CheckRow
              key={permission.value}
              className="check-row permission-tile"
              name="permissions"
              value={permission.value}
              label={permission.label}
            >
              <span>{permission.label}</span>
            </CheckRow>
          ))}
        </div>
        <Button type="submit" fullWidth disabled={pendingAction === 'role-create'}>
          Create role
        </Button>
      </form>

      <section className="settings-section permission-preview-section">
        <div className="settings-section-heading">
          <strong>Permission preview</strong>
          <span>Read-only view of channel visibility and actions. @everyone supplies inherited defaults before extra roles are added.</span>
        </div>
        <div className="permission-preview-controls">
          <label>
            Role
            <select value={previewRole?.id ?? ''} onChange={(event) => { setPreviewMemberId(null); setPreviewRoleId(event.target.value); }}>
              {server.roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <label>
            Member
            <select value={previewMemberId ?? ''} onChange={(event) => setPreviewMemberId(event.target.value || null)}>
              <option value="">Role only</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.user.displayName}</option>
              ))}
            </select>
          </label>
          <TextField
            label="Filter channels"
            value={previewChannelFilter}
            onChange={(event) => setPreviewChannelFilter(event.target.value)}
            placeholder="general"
          />
        </div>
        <div className="permission-preview-grid" role="table" aria-label="Permission preview">
          {previewRows.map((row) => (
            <div className="permission-preview-row" key={row.channel.id} role="row">
              <strong role="cell">#{row.channel.name}</strong>
              <span className={row.canView ? 'permission-allowed' : 'permission-denied'} role="cell">
                {row.canView ? 'Can view' : 'Hidden'}
              </span>
              <div role="cell">
                {row.actions.slice(0, 6).map((action) => (
                  <small key={action.value} className={action.allowed ? 'permission-chip-allowed' : 'permission-chip-denied'}>
                    {action.label}
                  </small>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="role-list">
        {server.roles.map((role) => {
          const isEveryone = role.name === '@everyone';
          const assignedMembers = server.members.filter((member) =>
            member.roles?.some((item) => item.role.id === role.id),
          );
          return (
            <section key={role.id} className="role-editor">
              <div className="role-editor-header">
                <div className="role-identity">
                  <span
                    className="role-color-dot"
                    style={{ backgroundColor: role.color || undefined }}
                  >
                    {!role.color ? <ShieldCheck size={14} aria-hidden="true" /> : null}
                  </span>
                  <div>
                    <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                    <div className="role-meta">
                      <span>
                        {isEveryone ? 'Default server role' : `${role.permissions.length} permissions`}
                      </span>
                      <Badge variant="neutral" className="role-meta-badge">
                        {assignedMembers.length} member{assignedMembers.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </div>
                </div>
                {!isEveryone ? (
                  <IconButton
                    label="Delete role"
                    variant="danger"
                    size="sm"
                    onClick={() => void deleteRole(role)}
                    disabled={pendingAction === `role-${role.id}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                ) : null}
              </div>
              <div className="permission-grid">
                {PERMISSION_OPTIONS.map((permission) => (
                  <CheckRow
                    key={permission.value}
                    className="check-row permission-toggle"
                    label={`${permission.label} permission for ${role.name}`}
                    checked={role.permissions.includes(permission.value)}
                    disabled={isEveryone || pendingAction === `role-${role.id}`}
                    onCheckedChange={(checked) =>
                      void toggleRolePermission(role, permission.value, checked)
                    }
                  >
                    <span>{permission.label}</span>
                  </CheckRow>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="settings-section role-members-section">
        <div className="settings-section-heading">
          <strong>Member role assignments</strong>
          <span>Open a member editor to add or remove roles for specific users.</span>
        </div>
        <div className="member-role-entry-list">
          {members.map((member) => {
            const memberRoles = member.roles?.map(({ role }) => role).filter((role) => role.name !== '@everyone') ?? [];
            const topRole = memberRoles.find((role) => role.color) ?? memberRoles[0];
            const isSelected = selectedMember?.id === member.id;

            return (
              <Button
                key={member.id}
                variant={isSelected ? 'secondary' : 'ghost'}
                className="member-role-entry"
                onClick={() => openMemberRoleEditor(member.id)}
              >
                <div className="member-role-entryIdentity">
                  <Avatar
                    src={member.user.avatarUrl ? assetUrl(member.user.avatarUrl) : null}
                    alt={member.user.displayName}
                    fallback={initials(member.user.displayName)}
                    size="md"
                    className={accentClass(member.user.id)}
                  />
                  <div className="member-role-entryText">
                    <strong style={topRole?.color ? { color: topRole.color } : undefined}>
                      {member.user.displayName}
                    </strong>
                    <span>{member.kind === 'OWNER' ? 'Owner' : member.user.status || 'Member'}</span>
                  </div>
                </div>
                <div className="member-role-entryMeta">
                  <div className="member-role-chipRow">
                    {memberRoles.length ? (
                      memberRoles.slice(0, 3).map((role) => (
                        <small key={role.id} className="member-role-chip" style={role.color ? { color: role.color } : undefined}>
                          {role.name}
                        </small>
                      ))
                    ) : (
                      <small className="member-role-chip member-role-chipMuted">No extra roles</small>
                    )}
                  </div>
                  <span className="member-role-entryAction">
                    Edit roles
                    <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
