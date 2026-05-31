import { ServerDetail } from '../api';
import { accentClass, initials } from '../helpers';

interface MemberSidebarProps {
  assetUrl: (url: string) => string;
  onManageMember: (memberId: string) => void;
  server: ServerDetail | null;
}

export function MemberSidebar({ assetUrl, onManageMember, server }: MemberSidebarProps) {
  return (
    <aside className="member-sidebar">
      <div className="member-title">Members — {server?.members.length ?? 0}</div>
      <div className="member-list">
        {server?.members.map((member) => (
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
              <span className={`status-dot ${member.user.status?.toLowerCase() || 'offline'}`} />
            </div>
            <div>
              <strong>{member.user.displayName}</strong>
              <span>{member.kind === 'OWNER' ? 'Owner' : member.user.status || 'Member'}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
