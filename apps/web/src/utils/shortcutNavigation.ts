import type { Channel, ChannelCategory } from '@/api';
import { groupChannelsByCategory } from './channelCategories';

export type NavigationDirection = 'previous' | 'next';

/**
 * The channels a keyboard step moves through, in the order the channel sidebar draws them:
 * uncategorized text and forum channels, then each category's channels. Voice channels are skipped
 * because the sidebar gives them no select action. `visibleChannels` is the sidebar's own list, so
 * the sidebar filter and the API's permission filtering both apply.
 */
export function navigableChannels(
  visibleChannels: Channel[],
  categories: ChannelCategory[],
): Channel[] {
  const grouped = groupChannelsByCategory(visibleChannels, categories, {
    includeEmptyCategories: false,
  });
  return [
    ...grouped.uncategorizedText,
    ...grouped.categories.flatMap((group) => group.channels),
  ].filter((channel) => channel.type !== 'VOICE');
}

/**
 * The item one step away from `currentId`, or null at either end (no wraparound). With nothing
 * selected, a step down lands on the first item and a step up on the last.
 */
export function stepItem<T extends { id: string }>(
  items: T[],
  currentId: string | null,
  direction: NavigationDirection,
  isCandidate: (item: T) => boolean = () => true,
): T | null {
  const currentIndex = currentId ? items.findIndex((item) => item.id === currentId) : -1;
  if (direction === 'next') {
    for (let index = currentIndex + 1; index < items.length; index += 1) {
      if (isCandidate(items[index])) return items[index];
    }
    return null;
  }
  const start = currentIndex === -1 ? items.length - 1 : currentIndex - 1;
  for (let index = start; index >= 0; index -= 1) {
    if (isCandidate(items[index])) return items[index];
  }
  return null;
}
