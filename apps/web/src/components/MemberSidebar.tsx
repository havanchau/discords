import { useState } from 'react';
import { ServerDetail } from '@/api';
import { accentClass, initials } from '@/helpers';
import { useTranslation, type Translate } from '@/i18n/LocaleProvider';
import { memberIdentityOf } from '@/utils/memberIdentity';
import { ProfileCard } from './profile/ProfileCard';
import {
  Avatar,
  Badge,
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
import { cn } from '@/utils/cn';
import { MessageSquare, ShieldCheck } from 'lucide-react';

const PRESENCE_KEYS = {
  ONLINE: 'presence.online',
  IDLE: 'presence.idle',
  DND: 'presence.dnd',
  OFFLINE: 'presence.offline',
} as const;

function presenceLabel(t: Translate, status: string | null | undefined): string {
  return t(PRESENCE_KEYS[status as keyof typeof PRESENCE_KEYS] ?? PRESENCE_KEYS.OFFLINE);
}

export interface MemberSidebarProps {
  assetUrl: (url: string) => string;
  accessToken: string;
  viewerId: string;
  onManageMember: (memberId: string) => void;
  onDirectMessage: (userId: string) => void;
  onAddFriend: (userId: string) => void;
  server: ServerDetail | null;
}

export function MemberSidebar({
  assetUrl,
  accessToken,
  viewerId,
  onManageMember,
  onDirectMessage,
  onAddFriend,
  server,
}: MemberSidebarProps) {
  const t = useTranslation();
  // The popover renders its content before opening; this gates the profile fetch to the open card.
  const [openProfileMemberId, setOpenProfileMemberId] = useState<string | null>(null);

  if (!server) {
    return (
      <aside className={cn(styles.memberSidebar, 'member-sidebar')}>
        <div className={styles.emptyNote}>{t('members.noServer')}</div>
      </aside>
    );
  }

  // 1. Filter online members (status is defined and not OFFLINE)
  const onlineMembers = server.members.filter(
    (member) => member.user.status && member.user.status !== 'OFFLINE',
  );

  // 2. Filter offline members (status is undefined/null or OFFLINE)
  const offlineMembers = server.members.filter(
    (member) => !member.user.status || member.user.status === 'OFFLINE',
  );

  // 3. Only hoisted roles (excluding '@everyone') get their own group.
  const displayRoles = server.roles.filter((role) => role.isHoisted && role.name !== '@everyone');

  // 4. Map online members to their highest-position hoisted role.
  const roleGroups: Record<
    string,
    { label: string; color?: string | null; members: typeof server.members }
  > = {};
  displayRoles.forEach((role) => {
    roleGroups[role.id] = { label: role.name, color: role.color, members: [] };
  });

  const onlineNoRole: typeof server.members = [];

  onlineMembers.forEach((member) => {
    const memberRoleIds = member.roles?.map((mr) => mr.role.id) ?? [];
    // `displayRoles` is ascending by position (server already returns roles this way), so the last
    // matching entry is the member's highest-position hoisted role.
    const candidateRoles = displayRoles.filter((r) => memberRoleIds.includes(r.id));
    const highestRole = candidateRoles.at(-1);
    if (highestRole) {
      roleGroups[highestRole.id].members.push(member);
    } else {
      onlineNoRole.push(member);
    }
  });

  // 5. Combine groups, filtering out empty ones
  const groups = [
    ...displayRoles.map((role) => roleGroups[role.id]).filter((g) => g.members.length > 0),
    { label: t('members.groupOnline'), members: onlineNoRole },
    { label: t('members.groupOffline'), members: offlineMembers },
  ].filter((g) => g.members.length > 0);

  return (
    <aside className={cn(styles.memberSidebar, 'member-sidebar')}>
      {groups.map((group) => (
        <section key={group.label} className={styles.memberGroup}>
          <div className={styles.memberTitle}>
            {'color' in group && group.color ? (
              <span className={styles.roleMarker} style={{ backgroundColor: group.color }} />
            ) : null}
            <span>
              {t('members.groupCount', { label: group.label, count: group.members.length })}
            </span>
          </div>
          <div className={styles.memberList}>
            {group.members.map((member) => {
              const topRole = member.roles?.find(({ role }) => role.color)?.role;
              const roleNames = member.roles?.map(({ role }) => role.name).filter(Boolean) ?? [];
              // @everyone applies to every member, so it says nothing about this one.
              const namedRoles = roleNames.filter((name) => name !== '@everyone');
              // The subtitle carries one kind of information only: the member's standing in the
              // server. Presence is conveyed by the status dot, never repeated as text here.
              const subtitle = member.kind === 'OWNER' ? t('roles.owner') : namedRoles[0];
              const identity = memberIdentityOf(member);
              const customStatus = member.user.customStatus;
              const customStatusLine = customStatus?.text
                ? [customStatus.emoji, customStatus.text].filter(Boolean).join(' ')
                : null;

              return (
                <ContextMenuRoot key={member.id}>
                  <ContextMenuTrigger>
                    <PopoverRoot
                      onOpenChange={(open) => setOpenProfileMemberId(open ? member.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className={styles.member}
                          title={t('members.viewProfile', { name: identity.displayName })}
                        >
                          <div className={styles.avatarWrap}>
                            <Avatar
                              src={identity.avatarUrl ? assetUrl(identity.avatarUrl) : null}
                              alt={identity.displayName}
                              fallback={initials(identity.displayName)}
                              size="sm"
                              className={accentClass(member.user.id)}
                            />
                            <span
                              className={cn(
                                styles.statusDot,
                                styles[member.user.status?.toLowerCase() || 'offline'],
                              )}
                              role="img"
                              aria-label={presenceLabel(t, member.user.status)}
                            />
                          </div>
                          <div className={styles.memberInfo}>
                            <strong style={topRole?.color ? { color: topRole.color } : undefined}>
                              {identity.roleIconUrl ? (
                                <img
                                  className={styles.roleIcon}
                                  src={assetUrl(identity.roleIconUrl)}
                                  alt=""
                                />
                              ) : null}
                              {identity.displayName}
                            </strong>
                            {member.kind === 'BOT' ? (
                              <span className={styles.botLine}>
                                <Badge
                                  variant="neutral"
                                  className={styles.botBadge}
                                  title={t('members.botBadgeLabel')}
                                >
                                  {t('message.botBadge')}
                                </Badge>
                                {subtitle}
                              </span>
                            ) : subtitle ? (
                              <span>{subtitle}</span>
                            ) : null}
                            {customStatusLine ? (
                              <span className={styles.customStatus} title={customStatusLine}>
                                {customStatusLine}
                              </span>
                            ) : null}
                          </div>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="left" align="start" className={styles.popoverContent}>
                        <ProfileCard
                          accessToken={accessToken}
                          userId={member.user.id}
                          viewerId={viewerId}
                          serverId={server.id}
                          isOpen={openProfileMemberId === member.id}
                          onDirectMessage={onDirectMessage}
                          onAddFriend={onAddFriend}
                        />
                      </PopoverContent>
                    </PopoverRoot>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onManageMember(member.id)}>
                      <ShieldCheck size={14} aria-hidden="true" />
                      {t('members.manageRoles')}
                    </ContextMenuItem>
                    {/* A bot has no inbox: it reads channels over the bot API only. */}
                    {member.kind === 'BOT' ? null : (
                      <ContextMenuItem onClick={() => onDirectMessage(member.user.id)}>
                        <MessageSquare size={14} aria-hidden="true" />
                        {t('members.message')}
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenuRoot>
              );
            })}
          </div>
        </section>
      ))}
      {!server.members.length && <div className={styles.emptyNote}>{t('members.empty')}</div>}
    </aside>
  );
}
