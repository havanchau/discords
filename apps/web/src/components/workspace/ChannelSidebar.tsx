import {
  CalendarDays,
  ChevronDown,
  Edit3,
  FolderPlus,
  Hash,
  Loader2,
  LogOut,
  MessageSquare,
  MessagesSquare,
  Search,
  Settings,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';
import { assetUrl, type Channel, type ChannelCategory } from '@/api';
import { accentClass, initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  TextField,
} from '@/components/ui';
import { useCollapsedCategories } from '@/hooks/useCollapsedCategories';
import { groupChannelsByCategory } from '@/utils/channelCategories';
import { memberHasServerPermission } from '@/utils/serverPermissions';
import { CategorySection, ChannelGroup, ChannelRow } from './ChannelList';
import styles from './ChannelSidebar.module.css';
import type { ChannelCreateType, WorkspaceSidebarProps } from './types';

interface ChannelSidebarProps extends WorkspaceSidebarProps {
  onCreateChannel: (type: ChannelCreateType, categoryId?: string) => void;
  onCreateCategory: () => void;
  onEditCategory: (category: ChannelCategory) => void;
  onOpenEvents: () => void;
}

export function ChannelSidebar({
  workspace,
  profileAvatarInputRef,
  actions,
  onCreateChannel,
  onCreateCategory,
  onEditCategory,
  onOpenEvents,
  serverEvents,
}: ChannelSidebarProps) {
  const t = useTranslation();
  const {
    auth,
    server,
    channel,
    visibleTextChannels,
    visibleVoiceChannels,
    channelQuery,
    inviteCode,
    isLoadingServers,
    pendingAction,
    activeCalls,
    channelBadges,
  } = workspace;
  const {
    openHome,
    createInvite,
    updateProfileAvatar,
    logout,
    selectChannel,
    setChannelQuery,
    setActiveDialog,
  } = actions;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { collapsedIds, toggleCategory } = useCollapsedCategories();
  const isSearching = Boolean(channelQuery.trim());
  const canManageChannels = memberHasServerPermission(server, auth.user.id, 'MANAGE_CHANNELS');
  const visibleChannelIds = new Set(
    [...visibleTextChannels, ...visibleVoiceChannels].map((item) => item.id),
  );
  const grouped = groupChannelsByCategory(
    (server?.channels ?? []).filter((item) => visibleChannelIds.has(item.id)),
    server?.categories ?? [],
    { includeEmptyCategories: canManageChannels && !isSearching },
  );

  function renderChannel(item: Channel) {
    if (item.type === 'VOICE') {
      return (
        <div className={styles.voiceBlock} key={item.id}>
          <ChannelRow
            channel={item}
            icon={<Volume2 size={16} aria-hidden="true" />}
            activeCall={activeCalls[item.id]}
          />
          {activeCalls[item.id]?.participants.length ? (
            <div className={styles.voiceOccupants}>
              {activeCalls[item.id].participants.map((participant) => (
                <span key={participant.socketId}>
                  {participant.displayName}
                  {participant.isMuted ? t('sidebar.voiceMutedSuffix') : ''}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <ChannelRow
        key={item.id}
        channel={item}
        icon={
          item.type === 'FORUM' ? (
            <MessagesSquare size={16} aria-hidden="true" />
          ) : (
            <Hash size={16} aria-hidden="true" />
          )
        }
        active={channel?.id === item.id}
        badge={channelBadges[item.id]}
        activeCall={activeCalls[item.id]}
        onClick={() => selectChannel(item)}
      />
    );
  }

  return (
    <aside
      className={cn(styles.sidebar, 'channel-sidebar')}
      aria-label={
        server ? t('sidebar.serverChannels', { server: server.name }) : t('sidebar.directMessages')
      }
    >
      <div className={styles.header}>
        {server ? (
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className={styles.headerButton}>
                <strong>{server.name}</strong>
                <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom">
              <DropdownMenuItem
                onSelect={() => setTimeout(() => setActiveDialog('server-settings'), 0)}
              >
                <Settings size={16} aria-hidden="true" />
                {t('sidebar.menu.serverSettings')}
              </DropdownMenuItem>
              {canManageChannels ? (
                <DropdownMenuItem onSelect={() => setTimeout(onCreateCategory, 0)}>
                  <FolderPlus size={16} aria-hidden="true" />
                  {t('sidebar.menu.createCategory')}
                </DropdownMenuItem>
              ) : null}
              {canManageChannels ? (
                <DropdownMenuItem onSelect={() => setTimeout(() => onCreateChannel('FORUM'), 0)}>
                  <MessagesSquare size={16} aria-hidden="true" />
                  {t('channel.dialog.createForum')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setTimeout(onOpenEvents, 0)}>
                <CalendarDays size={16} aria-hidden="true" />
                {t('sidebar.menu.events')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pendingAction === 'create-invite'}
                onSelect={() => void createInvite()}
              >
                {pendingAction === 'create-invite' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  <UserPlus size={16} aria-hidden="true" />
                )}
                {t('sidebar.menu.invitePeople')}
              </DropdownMenuItem>
              {inviteCode ? (
                <>
                  <DropdownMenuSeparator />
                  <span className={styles.menuHint}>{t('sidebar.menu.inviteReady')}</span>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenuRoot>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className={cn(styles.headerButton, styles.homeButton)}
            onClick={openHome}
          >
            <MessageSquare size={16} aria-hidden="true" />
            <strong>{t('sidebar.directMessages')}</strong>
          </Button>
        )}

        {isLoadingServers ? (
          <Loader2 className="spin" size={16} aria-hidden="true" />
        ) : server ? (
          <IconButton
            label={t('sidebar.searchChannels')}
            aria-pressed={isSearchOpen}
            onClick={() => {
              // Closing the field also clears the filter, so the list never stays silently
              // filtered by a query the user can no longer see.
              if (isSearchOpen) setChannelQuery('');
              setIsSearchOpen((current) => !current);
            }}
          >
            <Search size={16} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {server && isSearchOpen ? (
        <div className={styles.searchRow}>
          <TextField
            value={channelQuery}
            onChange={(event) => setChannelQuery(event.target.value)}
            placeholder={t('sidebar.browseChannels')}
            aria-label={t('sidebar.browseChannels')}
            autoFocus
            leadingIcon={<Search size={16} aria-hidden="true" />}
          />
        </div>
      ) : null}

      <div className={styles.scrollArea}>
        {server ? (
          <>
            {serverEvents.events.length ? (
              <Button
                type="button"
                variant="ghost"
                className={styles.eventsRow}
                onClick={onOpenEvents}
                data-testid="events-row"
              >
                <CalendarDays size={16} aria-hidden="true" />
                <span className={styles.channelName}>{t('sidebar.menu.events')}</span>
                <Badge
                  variant="neutral"
                  aria-label={t('sidebar.upcomingEvents', { count: serverEvents.events.length })}
                >
                  {serverEvents.events.length}
                </Badge>
              </Button>
            ) : null}
            <ChannelGroup
              title={t('sidebar.textChannels')}
              createLabel={t('sidebar.createTextChannel')}
              onCreate={() => onCreateChannel('TEXT')}
            >
              {grouped.uncategorizedText.length ? (
                grouped.uncategorizedText.map(renderChannel)
              ) : (
                <p className={styles.emptyNote}>
                  {grouped.categories.length
                    ? t('sidebar.noUncategorizedText')
                    : t('sidebar.noTextChannelsMatch')}
                </p>
              )}
            </ChannelGroup>

            <ChannelGroup
              title={t('sidebar.voiceChannels')}
              createLabel={t('sidebar.createVoiceChannel')}
              onCreate={() => onCreateChannel('VOICE')}
            >
              {grouped.uncategorizedVoice.length ? (
                grouped.uncategorizedVoice.map(renderChannel)
              ) : (
                <p className={styles.emptyNote}>{t('sidebar.noVoiceChannels')}</p>
              )}
            </ChannelGroup>

            {grouped.categories.map(({ category, channels: categoryChannels }) => {
              const isCollapsed = collapsedIds.includes(category.id) && !isSearching;
              const shownChannels = isCollapsed
                ? categoryChannels.filter(
                    (item) => item.id === channel?.id || Boolean(channelBadges[item.id]?.mentions),
                  )
                : categoryChannels;
              return (
                <CategorySection
                  key={category.id}
                  name={category.name}
                  isCollapsed={isCollapsed}
                  createLabel={
                    canManageChannels
                      ? t('sidebar.createChannelIn', { category: category.name })
                      : null
                  }
                  onToggle={() => toggleCategory(category.id)}
                  onCreate={() => onCreateChannel('TEXT', category.id)}
                  onEdit={canManageChannels ? () => onEditCategory(category) : undefined}
                >
                  {shownChannels.map(renderChannel)}
                </CategorySection>
              );
            })}
          </>
        ) : null}
      </div>

      <div className={styles.userStrip}>
        <input
          ref={profileAvatarInputRef}
          className={styles.hiddenFileInput}
          type="file"
          accept="image/*"
          onChange={(event) => void updateProfileAvatar(event)}
        />
        <Button
          type="button"
          variant="ghost"
          className={styles.avatarButton}
          onClick={() => profileAvatarInputRef.current?.click()}
          title={t('sidebar.changeAvatar')}
          aria-label={t('sidebar.changeAvatar')}
          disabled={pendingAction === 'profile-avatar'}
        >
          {auth.user.avatarUrl ? (
            <img src={assetUrl(auth.user.avatarUrl)} alt="" />
          ) : (
            <span className={`avatar small ${accentClass(auth.user.id)}`}>
              {initials(auth.user.displayName)}
            </span>
          )}
        </Button>
        <div className={styles.userIdentity}>
          <strong>{auth.user.displayName}</strong>
          <span>@{auth.user.username}</span>
        </div>
        <IconButton label={t('sidebar.editProfile')} onClick={() => setActiveDialog('profile')}>
          <Edit3 size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label={t('sidebar.logOut')} onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </aside>
  );
}
