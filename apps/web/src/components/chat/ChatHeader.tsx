import { Bell, Edit3, FolderOpen, Hash, Lock, MonitorUp, Phone, Search, Unlock, Video } from 'lucide-react';
import { assetUrl, Channel } from '../../api';
import { CallMode, CallState } from '../../helpers';
import { Avatar, Button, IconButton, Tooltip } from '../ui';
import type { ChatPanelChannelAvatar, ChatPanelPanels } from './types';
import styles from './ChatHeader.module.css';

interface ChatHeaderProps {
  channel: Channel | null;
  notificationUnreadCount: number;
  pendingAction: string | null;
  callState: CallState | null;
  panels: ChatPanelPanels;
  isChannelEncrypted: boolean;
  channelAvatar: ChatPanelChannelAvatar;
  startCall: (mode: CallMode, options?: { receiveOnly?: boolean }) => Promise<void>;
}

export function ChatHeader({
  channel,
  notificationUnreadCount,
  pendingAction,
  callState,
  panels,
  isChannelEncrypted,
  channelAvatar,
  startCall,
}: ChatHeaderProps) {
  return (
    <header className={styles.chatHeader}>
      <div className={styles.chatTitle}>
        <input
          ref={channelAvatar.inputRef}
          className={styles.fileInput}
          type="file"
          accept="image/*"
          onChange={channelAvatar.update}
        />
        <Button
          className={styles.channelAvatarButton}
          title="Change channel avatar"
          onClick={() => channelAvatar.inputRef.current?.click()}
          disabled={!channel || pendingAction === 'channel-avatar'}
          variant="ghost"
        >
          {channel?.avatarUrl ? (
            <Avatar
              src={assetUrl(channel.avatarUrl)}
              alt={channel.name}
              fallback={channel.name.slice(0, 1)}
              size="sm"
            />
          ) : (
            <Hash size={20} aria-hidden="true" />
          )}
        </Button>
        <div>
          <strong>{channel?.name || 'Select a channel'}</strong>
          <span>
            {channel
              ? channel.topic || `Server channel / #${channel.name}`
              : 'Choose a workspace channel to start.'}
          </span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Tooltip content="Start voice call">
          <IconButton
            label="Start voice call"
            onClick={() => void startCall('voice')}
            disabled={!channel || Boolean(callState)}
            variant={callState?.mode === 'voice' ? 'primary' : 'ghost'}
            data-testid="voice-call-button"
          >
            <Phone size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content="Start video call">
          <IconButton
            label="Start video call"
            onClick={() => void startCall('video')}
            disabled={!channel || Boolean(callState)}
            variant={callState?.mode === 'video' ? 'primary' : 'ghost'}
            data-testid="video-call-button"
          >
            <Video size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content="Share screen">
          <IconButton
            label="Share screen"
            onClick={() => void startCall('screen')}
            disabled={!channel || Boolean(callState)}
            variant={callState?.mode === 'screen' ? 'primary' : 'ghost'}
            data-testid="screen-share-button"
          >
            <MonitorUp size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content="Channel settings">
          <IconButton
            label="Channel settings"
            onClick={() => panels.setActiveDialog('channel-settings')}
            disabled={!channel}
            variant={panels.activeDialog === 'channel-settings' ? 'primary' : 'ghost'}
            data-testid="channel-settings-button"
          >
            <Edit3 size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content="Notifications">
          <IconButton
            label="Notifications"
            onClick={() =>
              panels.setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))
            }
            variant={panels.activePanel === 'notifications' ? 'primary' : 'ghost'}
            data-testid="notifications-button"
          >
            <span className={styles.notificationIconWrap}>
              <Bell size={18} aria-hidden="true" />
              {notificationUnreadCount > 0 && (
                <span className={styles.notificationBadge} aria-label={`${notificationUnreadCount} unread notifications`}>
                  {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                </span>
              )}
            </span>
          </IconButton>
        </Tooltip>

        <Tooltip content="Media, files, and links">
          <IconButton
            label="Media, files, and links"
            onClick={() =>
              panels.setActivePanel((current) => (current === 'media' ? null : 'media'))
            }
            disabled={!channel}
            variant={panels.activePanel === 'media' ? 'primary' : 'ghost'}
            data-testid="media-panel-button"
          >
            <FolderOpen size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content={isChannelEncrypted ? 'Encryption enabled' : 'Set encryption passphrase'}>
          <IconButton
            label={isChannelEncrypted ? 'Encryption enabled' : 'Set encryption passphrase'}
            onClick={() =>
              panels.setActivePanel((current) => (current === 'encryption' ? null : 'encryption'))
            }
            disabled={!channel}
            variant={panels.activePanel === 'encryption' || isChannelEncrypted ? 'primary' : 'ghost'}
            data-testid="encryption-button"
          >
            {isChannelEncrypted ? (
              <Lock size={18} aria-hidden="true" />
            ) : (
              <Unlock size={18} aria-hidden="true" />
            )}
          </IconButton>
        </Tooltip>

        <Button
          type="button"
          className={styles.headerSearch}
          variant="ghost"
          onClick={() => panels.setActivePanel((current) => (current === 'search' ? null : 'search'))}
          aria-pressed={panels.activePanel === 'search'}
          data-testid="search-button"
        >
          <span>Search</span>
          <Search size={14} aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
