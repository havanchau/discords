import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { PERMISSION_OPTIONS } from '../../helpers';
import { Button, IconButton, TextField } from '../ui';
import { CheckRow } from './SettingsRows';
import type { SettingsModalFields } from './types';

type RolesSettingsProps = Pick<
  SettingsModalFields,
  'createRole' | 'deleteRole' | 'pendingAction' | 'server' | 'toggleRolePermission'
>;

export function RolesSettings({
  createRole,
  deleteRole,
  pendingAction,
  server,
  toggleRolePermission,
}: RolesSettingsProps) {
  if (!server) return null;

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
                    <span>
                      {isEveryone ? 'Default server role' : `${role.permissions.length} permissions`}
                    </span>
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
    </div>
  );
}
