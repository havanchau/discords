import { ChevronDown, Pencil, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Channel } from '@/api';
import type { ActiveCallSummary } from '@/helpers';
import { cn } from '@/utils/cn';
import {
  Button,
  ContextMenuContent,
  ContextMenuRoot,
  ContextMenuTrigger,
  IconButton,
} from '@/components/ui';
import styles from './ChannelSidebar.module.css';
import type { ChannelBadgeState } from './types';

interface ChannelGroupProps {
  title: string;
  createLabel: string;
  onCreate: () => void;
  children: ReactNode;
}

export function ChannelGroup({ title, createLabel, onCreate, children }: ChannelGroupProps) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>
        {title}
        <IconButton label={createLabel} size="sm" onClick={onCreate}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
      </h2>
      <div className={styles.channelList}>{children}</div>
    </section>
  );
}

interface CategorySectionProps {
  name: string;
  isCollapsed: boolean;
  createLabel: string | null;
  onToggle: () => void;
  onCreate: () => void;
  /** Present only for members who can manage channels. */
  onEdit?: () => void;
  children: ReactNode;
}

export function CategorySection({
  name,
  isCollapsed,
  createLabel,
  onToggle,
  onCreate,
  onEdit,
  children,
}: CategorySectionProps) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>
        <button
          type="button"
          className={styles.categoryToggle}
          aria-expanded={!isCollapsed}
          onClick={onToggle}
        >
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={cn(styles.categoryChevron, isCollapsed && styles.categoryChevronCollapsed)}
          />
          <span>{name}</span>
        </button>
        <span className={styles.categoryActions}>
          {onEdit ? (
            <IconButton label={`Edit ${name}`} size="sm" onClick={onEdit}>
              <Pencil size={14} aria-hidden="true" />
            </IconButton>
          ) : null}
          {createLabel ? (
            <IconButton label={createLabel} size="sm" onClick={onCreate}>
              <Plus size={16} aria-hidden="true" />
            </IconButton>
          ) : null}
        </span>
      </h2>
      <div className={styles.channelList}>{children}</div>
    </section>
  );
}

interface ChannelRowProps {
  channel: Channel;
  icon: ReactNode;
  active?: boolean;
  badge?: ChannelBadgeState;
  activeCall?: ActiveCallSummary;
  /** Dims the row; cosmetic only, unread badges still show. */
  isMuted?: boolean;
  /** Right-click menu entries for this row, e.g. `NotificationMuteMenu`. */
  contextMenu?: ReactNode;
  onClick?: () => void;
}

export function ChannelRow({
  channel,
  icon,
  active,
  badge,
  activeCall,
  isMuted,
  contextMenu,
  onClick,
}: ChannelRowProps) {
  const callLabel = activeCall
    ? activeCall.mode === 'screen'
      ? 'Live'
      : String(activeCall.participants.length || 'Call')
    : null;

  const row = (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        styles.channelRow,
        isMuted && styles.channelRowMuted,
        active && styles.channelRowActive,
        !onClick && styles.channelRowStatic,
      )}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon}
      <span className={styles.channelName}>{channel.name}</span>
      {callLabel ? <span className={styles.liveBadge}>{callLabel}</span> : null}
      {badge?.mentions ? (
        <span className={styles.mentionBadge}>{badge.mentions}</span>
      ) : badge?.count ? (
        <span className={styles.unreadDot} aria-label={`${badge.count} unread messages`} />
      ) : null}
    </Button>
  );

  if (!contextMenu) return row;
  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>{contextMenu}</ContextMenuContent>
    </ContextMenuRoot>
  );
}
