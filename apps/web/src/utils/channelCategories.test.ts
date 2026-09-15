import type { Channel, ChannelCategory } from '../api';
import { groupChannelsByCategory } from './channelCategories';

function channel(id: string, overrides: Partial<Channel> = {}): Channel {
  return { id, serverId: 's1', name: id, type: 'TEXT', ...overrides };
}

function category(id: string, position: number): ChannelCategory {
  return { id, serverId: 's1', name: id, position };
}

describe('groupChannelsByCategory', () => {
  const categories = [category('later', 1), category('first', 0), category('empty', 2)];

  it('keeps uncategorized text and voice channels in separate groups', () => {
    const result = groupChannelsByCategory(
      [channel('general'), channel('lounge', { type: 'VOICE' })],
      [],
      { includeEmptyCategories: true },
    );

    expect(result.uncategorizedText.map((item) => item.id)).toEqual(['general']);
    expect(result.uncategorizedVoice.map((item) => item.id)).toEqual(['lounge']);
    expect(result.categories).toEqual([]);
  });

  it('orders categories by position and keeps channel order inside each', () => {
    const result = groupChannelsByCategory(
      [
        channel('b', { categoryId: 'later' }),
        channel('a', { categoryId: 'first' }),
        channel('c', { categoryId: 'later', type: 'VOICE' }),
      ],
      categories,
      { includeEmptyCategories: true },
    );

    expect(result.categories.map((group) => group.category.id)).toEqual([
      'first',
      'later',
      'empty',
    ]);
    expect(result.categories[1].channels.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('hides empty categories when asked, for example while searching', () => {
    const result = groupChannelsByCategory([channel('a', { categoryId: 'first' })], categories, {
      includeEmptyCategories: false,
    });

    expect(result.categories.map((group) => group.category.id)).toEqual(['first']);
  });

  it('treats channels in an unknown category as uncategorized', () => {
    const result = groupChannelsByCategory([channel('a', { categoryId: 'hidden' })], categories, {
      includeEmptyCategories: false,
    });

    expect(result.uncategorizedText.map((item) => item.id)).toEqual(['a']);
  });
});
