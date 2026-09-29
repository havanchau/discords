import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, ChannelCategory } from '@/api';
import type { ChannelOrderEntry } from './useWorkspaceNavigation';

const UNCATEGORIZED_TEXT = 'uncategorized-text';
const UNCATEGORIZED_VOICE = 'uncategorized-voice';

/** `null` (no category) renders as two containers, split by type — a VOICE channel never belongs
 * in the text container or vice versa, since a channel's `type` cannot change after creation. A
 * category container mixes types freely, matching how `CategorySection` already renders it. */
function containerIdFor(channel: Pick<Channel, 'categoryId' | 'type'>) {
  if (channel.categoryId) return channel.categoryId;
  return channel.type === 'VOICE' ? UNCATEGORIZED_VOICE : UNCATEGORIZED_TEXT;
}

function acceptsChannel(containerId: string, channel: Pick<Channel, 'type'>) {
  if (containerId === UNCATEGORIZED_VOICE) return channel.type === 'VOICE';
  if (containerId === UNCATEGORIZED_TEXT) return channel.type !== 'VOICE';
  return true;
}

function buildContainers(channels: Channel[]) {
  const containers: Record<string, string[]> = {
    [UNCATEGORIZED_TEXT]: [],
    [UNCATEGORIZED_VOICE]: [],
  };
  channels.forEach((channel) => {
    const containerId = containerIdFor(channel);
    (containers[containerId] ??= []).push(channel.id);
  });
  return containers;
}

interface UseChannelReorderDragOptions {
  server: { channels: Channel[]; categories?: ChannelCategory[] } | null;
  canManageChannels: boolean;
  reorderChannels: (entries: ChannelOrderEntry[]) => Promise<boolean>;
  reorderCategories: (orderedCategoryIds: string[]) => Promise<boolean>;
}

/**
 * Channel and category drag state for the sidebar (docs/features/channel-reorder.md → Web). The
 * container/category order is local state so `@dnd-kit/sortable` can move items live as the user
 * drags; it re-syncs from `server` whenever a drag is not in flight, so a realtime
 * `channels:reordered`/`categories:reordered` refetch from another client is picked up.
 */
export function useChannelReorderDrag({
  server,
  canManageChannels,
  reorderChannels,
  reorderCategories,
}: UseChannelReorderDragOptions) {
  const channels = useMemo(() => server?.channels ?? [], [server]);
  const categories = useMemo(() => server?.categories ?? [], [server]);
  const channelsById = useMemo(() => new Map(channels.map((item) => [item.id, item])), [channels]);

  const isDraggingRef = useRef(false);
  const [containers, setContainers] = useState(() => buildContainers(channels));
  const [categoryOrder, setCategoryOrder] = useState(() =>
    [...categories].sort((left, right) => left.position - right.position).map((item) => item.id),
  );
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setContainers(buildContainers(channels));
    setCategoryOrder(
      [...categories].sort((left, right) => left.position - right.position).map((item) => item.id),
    );
  }, [channels, categories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findContainerOf(channelId: string) {
    return Object.keys(containers).find((key) => containers[key].includes(channelId)) ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (categoryOrder.includes(id)) {
      setActiveCategoryId(id);
    } else {
      setActiveChannelId(id);
    }
    isDraggingRef.current = true;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !activeChannelId) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const sourceContainer = findContainerOf(activeId);
    // `over.id` is either another channel's id (drop beside it) or a container id (drop into an
    // empty container) — both resolve to the same target container.
    const targetContainer = containers[overId] ? overId : findContainerOf(overId);
    if (!sourceContainer || !targetContainer || sourceContainer === targetContainer) return;
    const channel = channelsById.get(activeId);
    if (!channel || !acceptsChannel(targetContainer, channel)) return;

    setContainers((current) => {
      const from = current[sourceContainer].filter((id) => id !== activeId);
      const overIndex = current[targetContainer].indexOf(overId);
      const to = [...current[targetContainer]];
      to.splice(overIndex >= 0 ? overIndex : to.length, 0, activeId);
      return { ...current, [sourceContainer]: from, [targetContainer]: to };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { over } = event;
    const draggedChannelId = activeChannelId;
    const draggedCategoryId = activeCategoryId;
    setActiveChannelId(null);
    setActiveCategoryId(null);
    isDraggingRef.current = false;
    if (!over) return;

    if (draggedCategoryId) {
      const oldIndex = categoryOrder.indexOf(draggedCategoryId);
      const newIndex = categoryOrder.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const nextOrder = arrayMove(categoryOrder, oldIndex, newIndex);
      setCategoryOrder(nextOrder);
      await reorderCategories(nextOrder);
      return;
    }

    if (draggedChannelId) {
      const containerId = findContainerOf(draggedChannelId);
      const overId = String(over.id);
      let nextContainers = containers;
      // Reorder within the final container (`handleDragOver` already moved it across containers).
      if (containerId && containers[containerId].includes(overId)) {
        const oldIndex = containers[containerId].indexOf(draggedChannelId);
        const newIndex = containers[containerId].indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          nextContainers = {
            ...containers,
            [containerId]: arrayMove(containers[containerId], oldIndex, newIndex),
          };
          setContainers(nextContainers);
        }
      }

      const entries: ChannelOrderEntry[] = [];
      let index = 0;
      for (const [key, ids] of Object.entries(nextContainers)) {
        const categoryId = key === UNCATEGORIZED_TEXT || key === UNCATEGORIZED_VOICE ? null : key;
        for (const id of ids) {
          entries.push({ id, categoryId, position: index });
          index += 1;
        }
      }
      await reorderChannels(entries);
    }
  }

  return {
    enabled: canManageChannels,
    sensors,
    collisionDetection: closestCenter,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: (event: DragEndEvent) => void handleDragEnd(event),
    containers,
    categoryOrder,
    channelsById,
    activeChannel: activeChannelId ? (channelsById.get(activeChannelId) ?? null) : null,
    activeCategory: activeCategoryId
      ? (categories.find((item) => item.id === activeCategoryId) ?? null)
      : null,
    uncategorizedTextContainerId: UNCATEGORIZED_TEXT,
    uncategorizedVoiceContainerId: UNCATEGORIZED_VOICE,
  };
}
