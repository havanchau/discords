import {
  Bell,
  Edit3,
  FolderOpen,
  Hash,
  Lock,
  MonitorUp,
  MoreVertical,
  Phone,
  Search,
  Unlock,
  Video,
} from 'lucide-react';
import { assetUrl, Channel } from '../../api';
import { CallMode, CallState } from '../../helpers';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  Avatar,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
} from '../ui';
import type { ChatPanelChannelAvatar, ChatPanelPanels } from './types';
import { useTranslation } from '../../i18n/LocaleProvider';
import styles from './ChatHeader.module.css';

interface ChatHeaderProps {
  channel: Channel | null;
  notificationUnreadCount: number;
  pendingAction: string | null;
  callState: CallState | null;
  panels: ChatPanelPanels;
  isChannelEncrypted: boolean;
  channelAvatar: ChatPanelChannelAvatar;
  startCall: (mode: CallMode, options?: { receiveOnly?: boolean }) => Promise<unknown>;
}

// Below this width only the voice call stays inline; the other call actions move into the menu.
const NARROW_HEADER = '(max-width: 560px)';

/**
 * The header carries the call actions and notifications inline; the less frequent channel actions
 * live behind an overflow menu so the row stays readable.
 */
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
  const t = useTranslation();
  const callActions = [
    {
      mode: 'voice' as const,
      icon: Phone,
      label: t('chatHeader.startVoiceCall'),
      testId: 'voice-call-button',
      secondary: false,
    },
    {
      mode: 'video' as const,
      icon: Video,
      label: t('chatHeader.startVideoCall'),
      testId: 'video-call-button',
      secondary: true,
    },
    {
      mode: 'screen' as const,
      icon: MonitorUp,
      label: t('chatHeader.shareScreen'),
      testId: 'screen-share-button',
      secondary: true,
    },
  ];

  const isNarrow = useMediaQuery(NARROW_HEADER);
  const inlineCallActions = isNarrow ? callActions.filter((action) => !action.secondary) : callActions;
  const menuCallActions = isNarrow ? callActions.filter((action) => action.secondary) : [];

  function togglePanel(panel: 'notifications' | 'media' | 'encryption' | 'search') {
    panels.setActivePanel((current) => (current === panel ? null : panel));
  }

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
          variant="ghost"
          title={t('chatHeader.changeChannelAvatar')}
          aria-label={t('chatHeader.changeChannelAvatar')}
          onClick={() => channelAvatar.inputRef.current?.click()}
          disabled={!channel || pendingAction === 'channel-avatar'}
        >
          {channel?.avatarUrl ? (
            <Avatar
              src={assetUrl(channel.avatarUrl)}
              alt=""
              fallback={channel.name.slice(0, 1)}
              size="sm"
            />
          ) : (
            <Hash size={18} aria-hidden="true" />
          )}
        </Button>
        <div className={styles.channelIdentity}>
          <strong>{channel?.name || t('chatHeader.selectChannel')}</strong>
          <span>{channel ? channel.topic || '' : t('chatHeader.selectChannelHint')}</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        {inlineCallActions.map(({ mode, icon: Icon, label, testId }) => (
          <Tooltip key={mode} content={label}>
            <IconButton
              label={label}
              onClick={() => void startCall(mode)}
              disabled={!channel || Boolean(callState)}
              variant={callState?.mode === mode ? 'primary' : 'ghost'}
              data-testid={testId}
            >
              <Icon size={18} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ))}

        <span className={styles.toolbarDivider} aria-hidden="true" />

        <Tooltip content={t('chatHeader.notifications')}>
          <IconButton
            label={
              notificationUnreadCount > 0
                ? t('chatHeader.notificationsUnread', { count: notificationUnreadCount })
                : t('chatHeader.notifications')
            }
            onClick={() => togglePanel('notifications')}
            variant={panels.activePanel === 'notifications' ? 'primary' : 'ghost'}
            data-testid="notifications-button"
          >
            <span className={styles.notificationIconWrap}>
              <Bell size={18} aria-hidden="true" />
              {notificationUnreadCount > 0 ? (
                <span className={styles.notificationBadge} aria-hidden="true">
                  {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                </span>
              ) : null}
            </span>
          </IconButton>
        </Tooltip>

        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <IconButton label={t('chatHeader.moreActions')} data-testid="channel-overflow-button">
              <MoreVertical size={18} aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            {menuCallActions.map(({ mode, icon: Icon, label }) => (
              <DropdownMenuItem
                key={mode}
                disabled={!channel || Boolean(callState)}
                onSelect={() => void startCall(mode)}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              disabled={!channel}
              onSelect={() => setTimeout(() => panels.setActiveDialog('channel-settings'), 0)}
            >
              <Edit3 size={16} aria-hidden="true" />
              {t('chatHeader.channelSettings')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!channel} onSelect={() => togglePanel('media')}>
              <FolderOpen size={16} aria-hidden="true" />
              {t('chatHeader.mediaFilesLinks')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!channel} onSelect={() => togglePanel('encryption')}>
              {isChannelEncrypted ? (
                <Lock size={16} aria-hidden="true" />
              ) : (
                <Unlock size={16} aria-hidden="true" />
              )}
              {isChannelEncrypted ? t('chatHeader.encryptionEnabled') : t('chatHeader.setEncryption')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuRoot>

        <Button
          type="button"
          className={styles.headerSearch}
          variant="ghost"
          size="sm"
          onClick={() => togglePanel('search')}
          aria-pressed={panels.activePanel === 'search'}
          data-testid="search-button"
        >
          <span>{t('chatHeader.search')}</span>
          <Search size={14} aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
