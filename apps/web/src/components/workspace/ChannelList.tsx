import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Channel } from '../../api';
import type { ActiveCallSummary } from '../../helpers';
import { cn } from '../../utils/cn';
import { Button, IconButton } from '../ui';
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

interface ChannelRowProps {
  channel: Channel;
  icon: ReactNode;
  active?: boolean;
  badge?: ChannelBadgeState;
  activeCall?: ActiveCallSummary;
  onClick?: () => void;
}

export function ChannelRow({ channel, icon, active, badge, activeCall, onClick }: ChannelRowProps) {
  const callLabel = activeCall
    ? activeCall.mode === 'screen'
      ? 'Live'
      : String(activeCall.participants.length || 'Call')
    : null;

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        styles.channelRow,
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
}
