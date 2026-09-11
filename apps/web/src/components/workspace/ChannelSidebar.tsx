import {
  ChevronDown,
  Edit3,
  Hash,
  Loader2,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../../api';
import { accentClass, initials } from '../../helpers';
import { cn } from '../../utils/cn';
import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  TextField,
} from '../ui';
import { ChannelGroup, ChannelRow } from './ChannelList';
import styles from './ChannelSidebar.module.css';
import type { ChannelCreateType, WorkspaceSidebarProps } from './types';

interface ChannelSidebarProps extends WorkspaceSidebarProps {
  onCreateChannel: (type: ChannelCreateType) => void;
}

export function ChannelSidebar({
  workspace,
  profileAvatarInputRef,
  actions,
  onCreateChannel,
}: ChannelSidebarProps) {
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
  const { openHome, createInvite, updateProfileAvatar, logout, setChannel, setChannelQuery, setActiveDialog } =
    actions;
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <aside
      className={cn(styles.sidebar, 'channel-sidebar')}
      aria-label={server ? `${server.name} channels` : 'Direct messages'}
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
              <DropdownMenuItem onSelect={() => setActiveDialog('server-settings')}>
                <Settings size={16} aria-hidden="true" />
                Server settings
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
                Invite people
              </DropdownMenuItem>
              {inviteCode ? (
                <>
                  <DropdownMenuSeparator />
                  <span className={styles.menuHint}>Invite is ready to paste</span>
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
            <strong>Direct messages</strong>
          </Button>
        )}

        {isLoadingServers ? (
          <Loader2 className="spin" size={16} aria-hidden="true" />
        ) : server ? (
          <IconButton
            label="Search channels"
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
            placeholder="Browse channels"
            aria-label="Browse channels"
            autoFocus
            leadingIcon={<Search size={16} aria-hidden="true" />}
          />
        </div>
      ) : null}

      <div className={styles.scrollArea}>
        {server ? (
          <>
            <ChannelGroup
              title="Text channels"
              createLabel="Create text channel"
              onCreate={() => onCreateChannel('TEXT')}
            >
              {visibleTextChannels.length ? (
                visibleTextChannels.map((item) => (
                  <ChannelRow
                    key={item.id}
                    channel={item}
                    icon={<Hash size={16} aria-hidden="true" />}
                    active={channel?.id === item.id}
                    badge={channelBadges[item.id]}
                    activeCall={activeCalls[item.id]}
                    onClick={() => setChannel(item)}
                  />
                ))
              ) : (
                <p className={styles.emptyNote}>No text channels match.</p>
              )}
            </ChannelGroup>

            <ChannelGroup
              title="Voice channels"
              createLabel="Create voice channel"
              onCreate={() => onCreateChannel('VOICE')}
            >
              {visibleVoiceChannels.length ? (
                visibleVoiceChannels.map((item) => (
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
                            {participant.isMuted ? ' · muted' : ''}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className={styles.emptyNote}>No voice channels yet.</p>
              )}
            </ChannelGroup>
          </>
        ) : null}
      </div>

      <div className={styles.userStrip}>
        <input
          ref={profileAvatarInputRef}
          className={styles.hiddenFileInput}
          type="file"
          accept="image/*"
          onChange={updateProfileAvatar}
        />
        <Button
          type="button"
          variant="ghost"
          className={styles.avatarButton}
          onClick={() => profileAvatarInputRef.current?.click()}
          title="Change profile avatar"
          aria-label="Change profile avatar"
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
        <IconButton label="Edit profile" onClick={() => setActiveDialog('profile')}>
          <Edit3 size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Log out" onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </aside>
  );
}
