import { assetUrl } from '../../api';
import { accentClass, initials } from '../../helpers';
import { Avatar, Badge, Button } from '../ui';
import { CheckRow } from './SettingsRows';
import type { SettingsModalFields } from './types';

type MemberRolesSettingsProps = Pick<
  SettingsModalFields,
  'pendingAction' | 'selectedMember' | 'server' | 'setActiveDialog' | 'toggleMemberRole'
>;

export function MemberRolesSettings({
  pendingAction,
  selectedMember,
  server,
  setActiveDialog,
  toggleMemberRole,
}: MemberRolesSettingsProps) {
  if (!server || !selectedMember) return null;

  const assignedRoles =
    selectedMember.roles
      ?.map((item) => item.role)
      .filter((role) => role.name !== '@everyone') ?? [];
  const sortedRoles = [...server.roles].sort((left, right) => {
    if (left.name === '@everyone') return -1;
    if (right.name === '@everyone') return 1;
    const leftAssigned = assignedRoles.some((role) => role.id === left.id);
    const rightAssigned = assignedRoles.some((role) => role.id === right.id);
    if (leftAssigned !== rightAssigned) return leftAssigned ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  return (
    <div className="settings-form">
      <div className="member-role-summary">
        <Avatar
          src={selectedMember.user.avatarUrl ? assetUrl(selectedMember.user.avatarUrl) : null}
          alt={selectedMember.user.displayName}
          fallback={initials(selectedMember.user.displayName)}
          size="lg"
          className={accentClass(selectedMember.user.id)}
        />
        <div className="member-role-summaryText">
          <strong>{selectedMember.user.displayName}</strong>
          <span>{selectedMember.kind === 'OWNER' ? 'Owner' : selectedMember.user.status || 'Member'}</span>
          <div className="member-role-summaryChips">
            <Badge variant="neutral" className="role-meta-badge">
              {assignedRoles.length} role{assignedRoles.length === 1 ? '' : 's'} assigned
            </Badge>
            {assignedRoles.length ? (
              assignedRoles.slice(0, 4).map((role) => (
                <small
                  key={role.id}
                  className="member-role-chip"
                  style={role.color ? { color: role.color } : undefined}
                >
                  {role.name}
                </small>
              ))
            ) : (
              <small className="member-role-chip member-role-chipMuted">No extra roles</small>
            )}
          </div>
        </div>
      </div>
      <div className="role-list">
        {sortedRoles.map((role) => {
          const isEveryone = role.name === '@everyone';
          const hasRole = Boolean(selectedMember.roles?.some((item) => item.role.id === role.id));
          return (
            <CheckRow
              key={role.id}
              className="check-row role-assign-row"
              label={`Assign ${role.name} to ${selectedMember.user.displayName}`}
              checked={hasRole}
              disabled={
                isEveryone ||
                selectedMember.kind === 'OWNER' ||
                pendingAction === `member-role-${selectedMember.id}-${role.id}`
              }
              onCheckedChange={(checked) =>
                void toggleMemberRole(selectedMember.id, role.id, checked)
              }
            >
              <div className="role-assign-content">
                <div className="role-assign-copy">
                  <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                  <small>
                    {isEveryone
                      ? 'Default role for every member'
                      : role.permissions.length
                        ? `${role.permissions.length} permissions`
                        : 'No permissions'}
                  </small>
                </div>
                <Badge
                  variant={isEveryone ? 'neutral' : hasRole ? 'success' : 'neutral'}
                  className="role-assign-state"
                >
                  {isEveryone ? 'Default' : hasRole ? 'Assigned' : 'Available'}
                </Badge>
              </div>
            </CheckRow>
          );
        })}
      </div>
      <footer className="settings-modal-footer">
        <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
          Done
        </Button>
      </footer>
    </div>
  );
}
