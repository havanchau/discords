import type { Channel, ChannelCategory } from '@/api';

export interface CategoryGroup {
  category: ChannelCategory;
  channels: Channel[];
}

export interface CategorizedChannels {
  uncategorizedText: Channel[];
  uncategorizedVoice: Channel[];
  categories: CategoryGroup[];
}

/**
 * Groups channels (already in display order) under their categories. Channels pointing at a
 * category the viewer did not receive fall back to the uncategorized groups.
 */
export function groupChannelsByCategory(
  channels: Channel[],
  categories: ChannelCategory[],
  options: { includeEmptyCategories: boolean },
): CategorizedChannels {
  const sortedCategories = [...categories].sort((left, right) => left.position - right.position);
  const knownCategoryIds = new Set(sortedCategories.map((category) => category.id));
  const channelsByCategory = new Map<string, Channel[]>();
  const uncategorizedText: Channel[] = [];
  const uncategorizedVoice: Channel[] = [];

  channels.forEach((channel) => {
    if (channel.categoryId && knownCategoryIds.has(channel.categoryId)) {
      const list = channelsByCategory.get(channel.categoryId) ?? [];
      list.push(channel);
      channelsByCategory.set(channel.categoryId, list);
      return;
    }
    (channel.type === 'VOICE' ? uncategorizedVoice : uncategorizedText).push(channel);
  });

  return {
    uncategorizedText,
    uncategorizedVoice,
    categories: sortedCategories
      .map((category) => ({ category, channels: channelsByCategory.get(category.id) ?? [] }))
      .filter((group) => options.includeEmptyCategories || group.channels.length > 0),
  };
}
