import { Bookmark, Compass, MessageSquare, Plus } from 'lucide-react';
import type {
  NotificationPreference,
  ServerDetail,
  ServerSummary,
  UpdateNotificationPreferenceInput,
} from '@/api';
import { initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import {
  Button,
  ContextMenuContent,
  ContextMenuRoot,
  ContextMenuTrigger,
  Tooltip,
} from '@/components/ui';
import { findServerPreference, isMuteActive } from '@/utils/notificationMute';
import { NotificationMuteMenu } from './NotificationMuteMenu';
import styles from './ServerRail.module.css';

interface ServerRailProps {
  servers: ServerSummary[];
  server: ServerDetail | null;
  openHome: () => void;
  openServer: (serverId: string) => Promise<void>;
  onAddServer: () => void;
  onOpenDiscovery: () => void;
  onOpenSavedMessages: () => void;
  notificationPreferences: NotificationPreference[];
  isUpdatingNotifications: boolean;
  updateNotificationPreference: (preference: UpdateNotificationPreferenceInput) => Promise<void>;
}

export function ServerRail({
  servers,
  server,
  openHome,
  openServer,
  onAddServer,
  onOpenDiscovery,
  onOpenSavedMessages,
  notificationPreferences,
  isUpdatingNotifications,
  updateNotificationPreference,
}: ServerRailProps) {
  const t = useTranslation();

  return (
    <nav className={cn(styles.rail, 'server-rail')} aria-label={t('serverRail.label')}>
      <Tooltip content={t('serverRail.directMessages')} side="right">
        <Button
          type="button"
          variant="ghost"
          className={cn(styles.serverButton, !server && styles.serverButtonActive)}
          aria-label={t('serverRail.directMessages')}
          aria-current={!server ? 'page' : undefined}
          onClick={openHome}
        >
          <MessageSquare size={20} aria-hidden="true" />
        </Button>
      </Tooltip>

      <Tooltip content={t('serverRail.savedMessages')} side="right">
        <Button
          type="button"
          variant="ghost"
          className={styles.serverButton}
          aria-label={t('serverRail.savedMessages')}
          onClick={onOpenSavedMessages}
        >
          <Bookmark size={20} aria-hidden="true" />
        </Button>
      </Tooltip>

      <div className={styles.railDivider} />

      {servers.map((item) => {
        const preference = findServerPreference(notificationPreferences, item.id);
        return (
          <ContextMenuRoot key={item.id}>
            <Tooltip content={item.name} side="right">
              <ContextMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    styles.serverButton,
                    isMuteActive(preference) && styles.serverButtonMuted,
                    server?.id === item.id && styles.serverButtonActive,
                  )}
                  aria-label={item.name}
                  aria-current={server?.id === item.id ? 'page' : undefined}
                  onClick={() => void openServer(item.id)}
                >
                  {initials(item.name)}
                </Button>
              </ContextMenuTrigger>
            </Tooltip>
            <ContextMenuContent>
              <NotificationMuteMenu
                preference={preference}
                disabled={isUpdatingNotifications}
                onMute={(muteDuration) =>
                  void updateNotificationPreference({
                    serverId: item.id,
                    muted: true,
                    muteDuration,
                  })
                }
                onUnmute={() =>
                  void updateNotificationPreference({ serverId: item.id, muted: false })
                }
              />
            </ContextMenuContent>
          </ContextMenuRoot>
        );
      })}

      <div className={styles.bottomActions}>
        <Tooltip content={t('serverRail.addServer')} side="right">
          <Button
            type="button"
            variant="ghost"
            className={cn(styles.serverButton, styles.serverAdd)}
            aria-label={t('serverRail.addServer')}
            onClick={onAddServer}
          >
            <Plus size={22} aria-hidden="true" />
          </Button>
        </Tooltip>

        <Tooltip content={t('discovery.rail')} side="right">
          <Button
            type="button"
            variant="ghost"
            className={cn(styles.serverButton, styles.serverAdd)}
            aria-label={t('discovery.rail')}
            onClick={onOpenDiscovery}
          >
            <Compass size={22} aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    </nav>
  );
}
