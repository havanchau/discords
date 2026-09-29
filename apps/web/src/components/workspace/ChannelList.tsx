import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Pencil, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Channel } from '@/api';
import type { ActiveCallSummary } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
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
  /** Present only when the viewer can drag this category (`SortableCategorySection`). */
  dragHandle?: ReactNode;
  children: ReactNode;
}

export function CategorySection({
  name,
  isCollapsed,
  createLabel,
  onToggle,
  onCreate,
  onEdit,
  dragHandle,
  children,
}: CategorySectionProps) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>
        {dragHandle}
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
  const t = useTranslation();
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
      {channel.isAgeRestricted ? (
        <span className={styles.ageBadge} title={t('channel.ageRestricted.label')}>
          {t('channel.ageRestricted.badge')}
        </span>
      ) : null}
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

interface SortableChannelItemProps {
  channelId: string;
  /** Only the handle initiates a drag; a tap anywhere else on the row still opens the channel. */
  dragHandleLabel: string;
  /** Whatever rendering a channel produces — a plain `ChannelRow`, or a voice row plus its
   * occupant list — wrapped as one draggable unit. */
  children: ReactNode;
}

/**
 * Wraps one rendered channel item with `@dnd-kit/sortable`'s `useSortable`, with its own drag
 * handle so a tap anywhere else on the row still opens the channel
 * (docs/features/channel-reorder.md → Web).
 */
export function SortableChannelItem({
  channelId,
  dragHandleLabel,
  children,
}: SortableChannelItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: channelId });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={styles.sortableRow}
    >
      <IconButton
        ref={setActivatorNodeRef}
        label={dragHandleLabel}
        size="sm"
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden="true" />
      </IconButton>
      <div className={styles.sortableRowContent}>{children}</div>
    </div>
  );
}

interface SortableCategorySectionProps extends CategorySectionProps {
  categoryId: string;
  dragHandleLabel: string;
}

/** `CategorySection` wrapped for dragging the category itself, reordering the category list. */
export function SortableCategorySection({
  categoryId,
  dragHandleLabel,
  ...sectionProps
}: SortableCategorySectionProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: categoryId });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <CategorySection
        {...sectionProps}
        dragHandle={
          <IconButton
            ref={setActivatorNodeRef}
            label={dragHandleLabel}
            size="sm"
            className={styles.dragHandle}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </IconButton>
        }
      />
    </div>
  );
}
