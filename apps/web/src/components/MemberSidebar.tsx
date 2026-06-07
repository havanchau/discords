import { ServerDetail } from '../api';
import { accentClass, initials } from '../helpers';
import {
  Avatar,
  Button,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from './ui';
import styles from './MemberSidebar.module.css';
import { cn } from '../utils/cn';
import { MessageSquare, ShieldCheck } from 'lucide-react';

interface MemberSidebarProps {
  assetUrl: (url: string) => string;
  onManageMember: (memberId: string) => void;
  onDirectMessage: (userId: string) => void;
  server: ServerDetail | null;
}

export function MemberSidebar({ assetUrl, onManageMember, onDirectMessage, server }: MemberSidebarProps) {
  if (!server) {
    return (
      <aside className={cn(styles.memberSidebar, 'member-sidebar')}>
        <div className={styles.emptyNote}>No server selected.</div>
      </aside>
    );
  }

  // 1. Filter online members (status is defined and not OFFLINE)
  const onlineMembers = server.members.filter(
    (member) => member.user.status && member.user.status !== 'OFFLINE'
  );

  // 2. Filter offline members (status is undefined/null or OFFLINE)
  const offlineMembers = server.members.filter(
    (member) => !member.user.status || member.user.status === 'OFFLINE'
  );

  // 3. Exclude '@everyone' role from display grouping
  const displayRoles = server.roles.filter((role) => role.name !== '@everyone');

  // 4. Map online members to their highest priority role
  const roleGroups: Record<string, { label: string; color?: string | null; members: typeof server.members }> = {};
  displayRoles.forEach((role) => {
    roleGroups[role.id] = { label: role.name, color: role.color, members: [] };
  });

  const onlineNoRole: typeof server.members = [];

  onlineMembers.forEach((member) => {
    const memberRoleIds = member.roles?.map((mr) => mr.role.id) ?? [];
    // Find the first role in displayRoles (which is sorted by priority) that the member has
    const highestRole = displayRoles.find((r) => memberRoleIds.includes(r.id));
    if (highestRole) {
      roleGroups[highestRole.id].members.push(member);
    } else {
      onlineNoRole.push(member);
    }
  });

  // 5. Combine groups, filtering out empty ones
  const groups = [
    ...displayRoles.map((role) => roleGroups[role.id]).filter((g) => g.members.length > 0),
    { label: 'Online', members: onlineNoRole },
    { label: 'Offline', members: offlineMembers },
  ].filter((g) => g.members.length > 0);

  return (
    <aside className={cn(styles.memberSidebar, 'member-sidebar')}>
      {groups.map((group) => (
        <section key={group.label} className={styles.memberGroup}>
          <div className={styles.memberTitle}>
            {'color' in group && group.color ? (
              <span className={styles.roleMarker} style={{ backgroundColor: group.color }} />
            ) : null}
            <span>{group.label} - {group.members.length}</span>
          </div>
          <div className={styles.memberList}>
            {group.members.map((member) => {
              const topRole = member.roles?.find(({ role }) => role.color)?.role;
              const roleNames = member.roles?.map(({ role }) => role.name).filter(Boolean) ?? [];

              return (
                <ContextMenuRoot key={member.id}>
                  <ContextMenuTrigger>
                    <PopoverRoot>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className={styles.member}
                          title={`View profile of ${member.user.displayName}`}
                        >
                          <div className={styles.avatarWrap}>
                            <Avatar
                              src={member.user.avatarUrl ? assetUrl(member.user.avatarUrl) : null}
                              alt={member.user.displayName}
                              fallback={initials(member.user.displayName)}
                              size="sm"
                              className={accentClass(member.user.id)}
                            />
                            <span
                              className={cn(
                                styles.statusDot,
                                styles[member.user.status?.toLowerCase() || 'offline']
                              )}
                            />
                          </div>
                          <div className={styles.memberInfo}>
                            <strong style={topRole?.color ? { color: topRole.color } : undefined}>
                              {member.user.displayName}
                            </strong>
                            <span>
                              {member.kind === 'OWNER' ? 'Owner' : member.user.status || 'Member'}
                            </span>
                          </div>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="left" align="start" className={styles.popoverContent}>
                        <div className={styles.popoverBanner} />
                        <div className={styles.popoverBody}>
                          <Avatar
                            src={member.user.avatarUrl ? assetUrl(member.user.avatarUrl) : null}
                            alt={member.user.displayName}
                            fallback={initials(member.user.displayName)}
                            size="lg"
                            className={cn(styles.profileCardAvatar, accentClass(member.user.id))}
                          />
                          <strong>{member.user.displayName}</strong>
                          <span>@{member.user.username}</span>
                          {member.user.bio ? <p>{member.user.bio}</p> : null}
                          {roleNames.length > 0 && (
                            <div className={styles.roleChips}>
                              {roleNames.slice(0, 4).map((roleName) => (
                                <small key={roleName} className={styles.roleChip}>
                                  {roleName}
                                </small>
                              ))}
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </PopoverRoot>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onManageMember(member.id)}>
                      <ShieldCheck size={14} aria-hidden="true" />
                      Manage Roles
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onDirectMessage(member.user.id)}>
                      <MessageSquare size={14} aria-hidden="true" />
                      Message
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuRoot>
              );
            })}
          </div>
        </section>
      ))}
      {!server.members.length && (
        <div className={styles.emptyNote}>No members yet.</div>
      )}
    </aside>
  );
}
