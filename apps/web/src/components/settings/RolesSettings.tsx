import { ChevronRight, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { assetUrl } from '../../api';
import { accentClass, initials, PERMISSION_OPTIONS } from '../../helpers';
import { Avatar, Badge, Button, IconButton, TextField } from '../ui';
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
  if (!server) return null;

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
