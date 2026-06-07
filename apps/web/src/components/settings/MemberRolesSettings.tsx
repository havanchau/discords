import { assetUrl } from '../../api';
import { accentClass, initials } from '../../helpers';
import { Button } from '../ui';
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

  return (
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
          <span>{selectedMember.kind === 'OWNER' ? 'Owner' : selectedMember.user.status || 'Member'}</span>
        </div>
      </div>
      <div className="role-list">
        {server.roles.map((role) => {
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
              <span style={{ color: role.color || undefined }}>{role.name}</span>
              <small>
                {isEveryone
                  ? 'Default'
                  : role.permissions.length
                    ? `${role.permissions.length} permissions`
                    : 'No permissions'}
              </small>
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
