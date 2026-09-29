import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  CalendarDays,
  ChevronDown,
  Edit3,
  FolderPlus,
  Gavel,
  Hash,
  Loader2,
  LogOut,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Moon,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { assetUrl, type Channel, type ChannelCategory } from '@/api';
import { accentClass, initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { PlatformReportsPage } from '@/components/platform/PlatformReportsPage';
import { usePlatformAdminAccess } from '@/hooks/usePlatformReports';
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
import { useThemeContext } from '@/contexts/appContexts';
import { useChannelReorderDrag } from '@/hooks/useChannelReorderDrag';
import { useCollapsedCategories } from '@/hooks/useCollapsedCategories';
import { groupChannelsByCategory } from '@/utils/channelCategories';
import { memberHasServerPermission } from '@/utils/serverPermissions';
import { findChannelPreference, isMuteActive } from '@/utils/notificationMute';
import {
  CategorySection,
  ChannelGroup,
  ChannelRow,
  SortableCategorySection,
  SortableChannelItem,
} from './ChannelList';
import { NotificationMuteMenu } from './NotificationMuteMenu';
import styles from './ChannelSidebar.module.css';
import type { ChannelCreateType, WorkspaceSidebarProps } from './types';

function channelIcon(type: Channel['type']) {
  if (type === 'VOICE') return <Volume2 size={16} aria-hidden="true" />;
  if (type === 'FORUM') return <MessagesSquare size={16} aria-hidden="true" />;
  if (type === 'STAGE') return <Radio size={16} aria-hidden="true" />;
  if (type === 'ANNOUNCEMENT') return <Megaphone size={16} aria-hidden="true" />;
  if (type === 'DECISION') return <Gavel size={16} aria-hidden="true" />;
  return <Hash size={16} aria-hidden="true" />;
}

interface ChannelSidebarProps extends WorkspaceSidebarProps {
  onCreateChannel: (type: ChannelCreateType, categoryId?: string) => void;
  onCreateCategory: () => void;
  onEditCategory: (category: ChannelCategory) => void;
  onOpenEvents: () => void;
  onOpenDecisions: () => void;
}

export function ChannelSidebar({
  workspace,
  profileAvatarInputRef,
  actions,
  onCreateChannel,
  onCreateCategory,
  onEditCategory,
  onOpenEvents,
  onOpenDecisions,
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
    notificationPreferences,
  } = workspace;
  const {
    openHome,
    createInvite,
    updateProfileAvatar,
    logout,
    selectChannel,
    setChannelQuery,
    setActiveDialog,
    updateNotificationPreference,
    reorderChannels,
    reorderCategories,
  } = actions;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPlatformReportsOpen, setIsPlatformReportsOpen] = useState(false);
  const isPlatformAdmin = usePlatformAdminAccess();
  const { resolvedTheme, setUiTheme } = useThemeContext();
  const isDarkTheme = resolvedTheme === 'dark';
  const { collapsedIds, toggleCategory } = useCollapsedCategories();
  const isSearching = Boolean(channelQuery.trim());
  const canManageChannels = memberHasServerPermission(server, auth.user.id, 'MANAGE_CHANNELS');
  // Dragging is disabled while searching (the list is filtered, not the full server order) — the
  // same condition `includeEmptyCategories` already used below, since both mean "show everything,
  // in the moderator's own arrangement" (docs/features/channel-reorder.md → Web).
  const dragEnabled = canManageChannels && !isSearching;
  const visibleChannelIds = new Set(
    [...visibleTextChannels, ...visibleVoiceChannels].map((item) => item.id),
  );
  const grouped = groupChannelsByCategory(
    (server?.channels ?? []).filter((item) => visibleChannelIds.has(item.id)),
    server?.categories ?? [],
    { includeEmptyCategories: canManageChannels && !isSearching },
  );
  const groupedChannelsByCategoryId = new Map(
    grouped.categories.map((group) => [group.category.id, group.channels]),
  );

  const drag = useChannelReorderDrag({
    server,
    canManageChannels: dragEnabled,
    reorderChannels,
    reorderCategories,
  });

  /** The drag hook's live container order when dragging is possible; the filtered/grouped order
   * otherwise (search, or a member without `MANAGE_CHANNELS`). */
  function channelsFor(containerId: string, fallback: Channel[]): Channel[] {
    if (!dragEnabled) return fallback;
    return (drag.containers[containerId] ?? []).flatMap((id) => {
      const item = drag.channelsById.get(id);
      return item && visibleChannelIds.has(item.id) ? [item] : [];
    });
  }

  const categorySequence = dragEnabled
    ? drag.categoryOrder.flatMap((id) => {
        const category = (server?.categories ?? []).find((item) => item.id === id);
        return category ? [category] : [];
      })
    : grouped.categories.map((group) => group.category);

  function renderChannel(item: Channel) {
    const mutePreference = findChannelPreference(notificationPreferences, item.id);
    const muteProps = {
      isMuted: isMuteActive(mutePreference),
      contextMenu: (
        <NotificationMuteMenu
          preference={mutePreference}
          disabled={pendingAction === 'notification-preference'}
          onMute={(muteDuration) =>
            void updateNotificationPreference({ channelId: item.id, muted: true, muteDuration })
          }
          onUnmute={() => void updateNotificationPreference({ channelId: item.id, muted: false })}
        />
      ),
    };
    if (item.type === 'VOICE') {
      return (
        <div className={styles.voiceBlock}>
          <ChannelRow
            channel={item}
            icon={<Volume2 size={16} aria-hidden="true" />}
            activeCall={activeCalls[item.id]}
            {...muteProps}
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
        channel={item}
        icon={channelIcon(item.type)}
        active={channel?.id === item.id}
        badge={channelBadges[item.id]}
        activeCall={activeCalls[item.id]}
        onClick={() => selectChannel(item)}
        {...muteProps}
      />
    );
  }

  /** `renderChannel`, wrapped with a drag handle when dragging is possible, keyed either way. */
  function renderChannelItem(item: Channel): ReactNode {
    const content = renderChannel(item);
    if (!dragEnabled) return <Fragment key={item.id}>{content}</Fragment>;
    return (
      <SortableChannelItem
        key={item.id}
        channelId={item.id}
        dragHandleLabel={t('channel.action.reorder', { name: item.name })}
      >
        {content}
      </SortableChannelItem>
    );
  }

  return (
    <aside
      className={cn(styles.sidebar, !server && styles.homeSidebar, 'channel-sidebar')}
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
              {canManageChannels ? (
                <DropdownMenuItem onSelect={() => setTimeout(() => onCreateChannel('STAGE'), 0)}>
                  <Radio size={16} aria-hidden="true" />
                  {t('channel.dialog.createStage')}
                </DropdownMenuItem>
              ) : null}
              {canManageChannels ? (
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => onCreateChannel('ANNOUNCEMENT'), 0)}
                >
                  <Megaphone size={16} aria-hidden="true" />
                  {t('channel.dialog.createAnnouncement')}
                </DropdownMenuItem>
              ) : null}
              {canManageChannels ? (
                <DropdownMenuItem onSelect={() => setTimeout(() => onCreateChannel('DECISION'), 0)}>
                  <Gavel size={16} aria-hidden="true" />
                  {t('channel.dialog.createDecision')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setTimeout(onOpenEvents, 0)}>
                <CalendarDays size={16} aria-hidden="true" />
                {t('sidebar.menu.events')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTimeout(onOpenDecisions, 0)}>
                <Gavel size={16} aria-hidden="true" />
                {t('sidebar.menu.decisions')}
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
          <DndContext
            sensors={drag.sensors}
            collisionDetection={drag.collisionDetection}
            onDragStart={drag.onDragStart}
            onDragOver={drag.onDragOver}
            onDragEnd={drag.onDragEnd}
            accessibility={{
              announcements: {
                onDragStart: ({ active }) =>
                  t('sidebar.reorder.pickedUp', {
                    name:
                      drag.channelsById.get(String(active.id))?.name ??
                      (server.categories ?? []).find((item) => item.id === active.id)?.name ??
                      '',
                  }),
                onDragOver: ({ active }) =>
                  t('sidebar.reorder.moved', {
                    name:
                      drag.channelsById.get(String(active.id))?.name ??
                      (server.categories ?? []).find((item) => item.id === active.id)?.name ??
                      '',
                  }),
                onDragEnd: ({ active }) =>
                  t('sidebar.reorder.dropped', {
                    name:
                      drag.channelsById.get(String(active.id))?.name ??
                      (server.categories ?? []).find((item) => item.id === active.id)?.name ??
                      '',
                  }),
                onDragCancel: () => t('sidebar.reorder.cancelled'),
              },
            }}
          >
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
              {(() => {
                const textChannels = channelsFor(
                  drag.uncategorizedTextContainerId,
                  grouped.uncategorizedText,
                );
                const voiceChannels = channelsFor(
                  drag.uncategorizedVoiceContainerId,
                  grouped.uncategorizedVoice,
                );
                return (
                  <>
                    <ChannelGroup
                      title={t('sidebar.textChannels')}
                      createLabel={t('sidebar.createTextChannel')}
                      onCreate={() => onCreateChannel('TEXT')}
                    >
                      {textChannels.length ? (
                        <SortableContext
                          items={textChannels.map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {textChannels.map(renderChannelItem)}
                        </SortableContext>
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
                      {voiceChannels.length ? (
                        <SortableContext
                          items={voiceChannels.map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {voiceChannels.map(renderChannelItem)}
                        </SortableContext>
                      ) : (
                        <p className={styles.emptyNote}>{t('sidebar.noVoiceChannels')}</p>
                      )}
                    </ChannelGroup>
                  </>
                );
              })()}

              <SortableContext
                items={categorySequence.map((category) => category.id)}
                strategy={verticalListSortingStrategy}
              >
                {categorySequence.map((category) => {
                  const categoryChannels = channelsFor(
                    category.id,
                    groupedChannelsByCategoryId.get(category.id) ?? [],
                  );
                  const isCollapsed = collapsedIds.includes(category.id) && !isSearching;
                  const shownChannels = isCollapsed
                    ? categoryChannels.filter(
                        (item) =>
                          item.id === channel?.id || Boolean(channelBadges[item.id]?.mentions),
                      )
                    : categoryChannels;
                  const sectionProps = {
                    name: category.name,
                    isCollapsed,
                    createLabel: canManageChannels
                      ? t('sidebar.createChannelIn', { category: category.name })
                      : null,
                    onToggle: () => toggleCategory(category.id),
                    onCreate: () => onCreateChannel('TEXT', category.id),
                    onEdit: canManageChannels ? () => onEditCategory(category) : undefined,
                  };
                  const children = (
                    <SortableContext
                      items={shownChannels.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {shownChannels.map(renderChannelItem)}
                    </SortableContext>
                  );
                  return dragEnabled ? (
                    <SortableCategorySection
                      key={category.id}
                      categoryId={category.id}
                      dragHandleLabel={t('category.action.reorder', { name: category.name })}
                      {...sectionProps}
                    >
                      {children}
                    </SortableCategorySection>
                  ) : (
                    <CategorySection key={category.id} {...sectionProps}>
                      {children}
                    </CategorySection>
                  );
                })}
              </SortableContext>
            </>
            <DragOverlay>
              {drag.activeChannel ? (
                <div className={styles.dragOverlay}>{renderChannel(drag.activeChannel)}</div>
              ) : drag.activeCategory ? (
                <div className={styles.dragOverlay}>
                  <strong>{drag.activeCategory.name}</strong>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
        <div className={styles.userActions}>
          {isPlatformAdmin ? (
            <IconButton
              label={t('platform.navLabel')}
              onClick={() => setIsPlatformReportsOpen(true)}
            >
              <ShieldCheck size={16} aria-hidden="true" />
            </IconButton>
          ) : null}
          {/* Quick switch only ever sets an explicit theme; `system` stays reachable from settings. */}
          <IconButton
            label={isDarkTheme ? t('sidebar.theme.toLight') : t('sidebar.theme.toDark')}
            onClick={() => setUiTheme(isDarkTheme ? 'light' : 'dark')}
          >
            {isDarkTheme ? (
              <Sun size={16} aria-hidden="true" />
            ) : (
              <Moon size={16} aria-hidden="true" />
            )}
          </IconButton>
          <IconButton label={t('sidebar.editProfile')} onClick={() => setActiveDialog('profile')}>
            <Edit3 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label={t('sidebar.logOut')} onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <PlatformReportsPage open={isPlatformReportsOpen} onOpenChange={setIsPlatformReportsOpen} />
    </aside>
  );
}
