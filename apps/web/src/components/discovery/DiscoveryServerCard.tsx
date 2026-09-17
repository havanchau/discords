import { Flag, Loader2, MoreVertical } from 'lucide-react';
import type { DiscoveryServerCard as DiscoveryCard } from '@/api';
import { initials } from '@/helpers';
import {
  Avatar,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './Discovery.module.css';

interface DiscoveryServerCardProps {
  server: DiscoveryCard;
  isMember: boolean;
  isJoining: boolean;
  onJoin: () => void;
  onOpen: () => void;
  onSelectTag: (tag: string) => void;
  onReport: () => void;
}

/** One directory entry: only what the API exposes publicly, never channels or members. */
export function DiscoveryServerCard({
  server,
  isMember,
  isJoining,
  onJoin,
  onOpen,
  onSelectTag,
  onReport,
}: DiscoveryServerCardProps) {
  const t = useTranslation();

  return (
    <article className={styles.card} aria-labelledby={`discovery-${server.id}`}>
      <Avatar alt={server.name} fallback={initials(server.name)} />
      <div className={styles.cardBody}>
        <strong id={`discovery-${server.id}`}>{server.name}</strong>
        <small>{t('discovery.members', { count: server.memberCount })}</small>
        {server.description ? <p>{server.description}</p> : null}
        {server.tags.length ? (
          <div className={styles.tags} role="group" aria-label={t('discovery.tagsLabel')}>
            {server.tags.map((tag) => (
              <Button key={tag} size="sm" variant="ghost" onClick={() => onSelectTag(tag)}>
                #{tag}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.cardActions}>
        {isMember ? (
          <Button size="sm" variant="secondary" onClick={onOpen}>
            {t('discovery.open')}
          </Button>
        ) : (
          <Button size="sm" disabled={isJoining} onClick={onJoin}>
            {isJoining ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
            {t('discovery.join')}
          </Button>
        )}
        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <IconButton label={t('discovery.more', { name: server.name })} size="sm">
              <MoreVertical size={16} aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem onSelect={onReport}>
              <Flag size={16} aria-hidden="true" />
              {t('discovery.report.action')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuRoot>
      </div>
    </article>
  );
}
