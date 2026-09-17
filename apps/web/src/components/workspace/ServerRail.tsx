import { Bookmark, MessageSquare, Plus } from 'lucide-react';
import type { ServerDetail, ServerSummary } from '@/api';
import { initials } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { Button, Tooltip } from '@/components/ui';
import styles from './ServerRail.module.css';

interface ServerRailProps {
  servers: ServerSummary[];
  server: ServerDetail | null;
  openHome: () => void;
  openServer: (serverId: string) => Promise<void>;
  onAddServer: () => void;
  onOpenSavedMessages: () => void;
}

export function ServerRail({
  servers,
  server,
  openHome,
  openServer,
  onAddServer,
  onOpenSavedMessages,
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

      {servers.map((item) => (
        <Tooltip key={item.id} content={item.name} side="right">
          <Button
            type="button"
            variant="ghost"
            className={cn(styles.serverButton, server?.id === item.id && styles.serverButtonActive)}
            aria-label={item.name}
            aria-current={server?.id === item.id ? 'page' : undefined}
            onClick={() => void openServer(item.id)}
          >
            {initials(item.name)}
          </Button>
        </Tooltip>
      ))}

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
    </nav>
  );
}
