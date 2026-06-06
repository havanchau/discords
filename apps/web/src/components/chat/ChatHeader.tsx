import { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { Bell, Edit3, Hash, Lock, MonitorUp, Phone, Search, Unlock, Video } from 'lucide-react';
import { assetUrl, Channel } from '../../api';
import { CallMode, CallState } from '../../helpers';
import { Avatar, Button, IconButton, Tooltip } from '../ui';
import { ActiveDialog, ActivePanel } from '../ChatPanel';
import styles from './ChatHeader.module.css';

interface ChatHeaderProps {
  channel: Channel | null;
  pendingAction: string | null;
  callState: CallState | null;
  activeDialog: ActiveDialog;
  activePanel: ActivePanel;
  isChannelEncrypted: boolean;
  channelAvatarInputRef: RefObject<HTMLInputElement | null>;
  updateChannelAvatar: (event: ChangeEvent<HTMLInputElement>) => void;
  startCall: (mode: CallMode, options?: { receiveOnly?: boolean }) => Promise<void>;
  setActiveDialog: (dialog: ActiveDialog) => void;
  setActivePanel: Dispatch<SetStateAction<ActivePanel>>;
}

export function ChatHeader({
  channel,
  pendingAction,
  callState,
  activeDialog,
  activePanel,
  isChannelEncrypted,
  channelAvatarInputRef,
  updateChannelAvatar,
  startCall,
  setActiveDialog,
  setActivePanel,
}: ChatHeaderProps) {
  return (
    <header className={styles.chatHeader}>
      <div className={styles.chatTitle}>
        <input
          ref={channelAvatarInputRef}
          className={styles.fileInput}
          type="file"
          accept="image/*"
          onChange={updateChannelAvatar}
        />
        <Button
          className={styles.channelAvatarButton}
          title="Change channel avatar"
          onClick={() => channelAvatarInputRef.current?.click()}
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
            onClick={() => setActiveDialog('channel-settings')}
            disabled={!channel}
            variant={activeDialog === 'channel-settings' ? 'primary' : 'ghost'}
            data-testid="channel-settings-button"
          >
            <Edit3 size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content="Notifications">
          <IconButton
            label="Notifications"
            onClick={() =>
              setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))
            }
            variant={activePanel === 'notifications' ? 'primary' : 'ghost'}
            data-testid="notifications-button"
          >
            <Bell size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>

        <Tooltip content={isChannelEncrypted ? 'Encryption enabled' : 'Set encryption passphrase'}>
          <IconButton
            label={isChannelEncrypted ? 'Encryption enabled' : 'Set encryption passphrase'}
            onClick={() =>
              setActivePanel((current) => (current === 'encryption' ? null : 'encryption'))
            }
            disabled={!channel}
            variant={activePanel === 'encryption' || isChannelEncrypted ? 'primary' : 'ghost'}
            data-testid="encryption-button"
          >
            {isChannelEncrypted ? (
              <Lock size={18} aria-hidden="true" />
            ) : (
              <Unlock size={18} aria-hidden="true" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip content="Search">
          <IconButton
            label="Search"
            onClick={() => setActivePanel((current) => (current === 'search' ? null : 'search'))}
            variant={activePanel === 'search' ? 'primary' : 'ghost'}
            data-testid="search-button"
          >
            <Search size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
