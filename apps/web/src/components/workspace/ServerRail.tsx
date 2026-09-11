import { MessageSquare, Plus } from 'lucide-react';
import type { ServerDetail, ServerSummary } from '../../api';
import { initials } from '../../helpers';
import { cn } from '../../utils/cn';
import { Button, Tooltip } from '../ui';
import styles from './ServerRail.module.css';

interface ServerRailProps {
  servers: ServerSummary[];
  server: ServerDetail | null;
  openHome: () => void;
  openServer: (serverId: string) => Promise<void>;
  onAddServer: () => void;
}

export function ServerRail({ servers, server, openHome, openServer, onAddServer }: ServerRailProps) {
  return (
    <nav className={cn(styles.rail, 'server-rail')} aria-label="Servers">
      <Tooltip content="Direct Messages" side="right">
        <Button
          type="button"
          className={cn(styles.serverButton, styles.serverHome, !server && styles.serverButtonActive)}
          aria-label="Direct Messages"
          aria-current={!server ? 'page' : undefined}
          onClick={openHome}
        >
          <MessageSquare size={20} aria-hidden="true" />
        </Button>
      </Tooltip>

      <div className={styles.railDivider} />

      {servers.map((item) => (
        <Tooltip key={item.id} content={item.name} side="right">
          <Button
            type="button"
            className={cn(styles.serverButton, server?.id === item.id && styles.serverButtonActive)}
            aria-label={item.name}
            aria-current={server?.id === item.id ? 'page' : undefined}
            onClick={() => void openServer(item.id)}
          >
            {initials(item.name)}
          </Button>
        </Tooltip>
      ))}

      <Tooltip content="Add a server" side="right">
        <Button
          type="button"
          className={cn(styles.serverButton, styles.serverAdd)}
          aria-label="Add a server"
          onClick={onAddServer}
        >
          <Plus size={22} aria-hidden="true" />
        </Button>
      </Tooltip>
    </nav>
  );
}
