import { ServerDetail } from '../api';
import { accentClass, initials } from '../helpers';

interface MemberSidebarProps {
  assetUrl: (url: string) => string;
  onManageMember: (memberId: string) => void;
  server: ServerDetail | null;
}

export function MemberSidebar({ assetUrl, onManageMember, server }: MemberSidebarProps) {
  const onlineMembers =
    server?.members.filter((member) => member.user.status && member.user.status !== 'OFFLINE') ??
    [];
  const offlineMembers =
    server?.members.filter((member) => !member.user.status || member.user.status === 'OFFLINE') ??
    [];
  const groupedMembers = [
    { label: 'Online', members: onlineMembers },
    { label: 'Offline', members: offlineMembers },
  ].filter((group) => group.members.length);

  return (
    <aside className="member-sidebar">
      {groupedMembers.map((group) => (
        <section key={group.label} className="member-group">
          <div className="member-title">
            {group.label} — {group.members.length}
          </div>
          <div className="member-list">
            {group.members.map((member) => {
              const topRole = member.roles?.find(({ role }) => role.color)?.role;
              return (
                <button
                  key={member.id}
                  type="button"
                  className="member"
                  onClick={() => onManageMember(member.id)}
                  title={`Manage ${member.user.displayName}`}
                >
                  <div className="avatar-wrap">
                    <div className={`avatar small ${accentClass(member.user.id)}`}>
                      {member.user.avatarUrl ? (
                        <img src={assetUrl(member.user.avatarUrl)} alt={member.user.displayName} />
                      ) : (
                        initials(member.user.displayName)
                      )}
                    </div>
                    <span
                      className={`status-dot ${member.user.status?.toLowerCase() || 'offline'}`}
                    />
                  </div>
                  <div>
                    <strong style={topRole?.color ? { color: topRole.color } : undefined}>
                      {member.user.displayName}
                    </strong>
                    <span>
                      {member.kind === 'OWNER' ? 'Owner' : member.user.status || 'Member'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!server?.members.length ? (
        <div className="empty-note member-empty">No members yet.</div>
      ) : null}
    </aside>
  );
}
