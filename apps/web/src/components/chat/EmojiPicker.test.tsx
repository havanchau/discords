import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServerEmojiProvider } from '../../contexts/ServerEmojiContext';
import { EmojiPicker, ReactionEmoji } from './EmojiPicker';

const emojis = [
  { id: 'e1', name: 'party', url: '/uploads/party.png', creatorId: 'u1', createdAt: '2026-09-15' },
];

describe('EmojiPicker', () => {
  it('selects server emoji as :name: shortcodes', () => {
    const onSelect = vi.fn();
    render(
      <ServerEmojiProvider emojis={emojis}>
        <EmojiPicker onSelect={onSelect} />
      </ServerEmojiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Emoji :party:' }));

    expect(onSelect).toHaveBeenCalledWith(':party:');
  });

  it('hides the server section outside a server', () => {
    render(<EmojiPicker onSelect={vi.fn()} />);

    expect(screen.queryByText('Server emoji')).toBeNull();
  });
});

describe('ReactionEmoji', () => {
  it('renders an image for a known server emoji and text otherwise', () => {
    const { container } = render(
      <ServerEmojiProvider emojis={emojis}>
        <ReactionEmoji emoji=":party:" />
        <ReactionEmoji emoji=":missing:" />
      </ServerEmojiProvider>,
    );

    expect(container.querySelector('img')?.getAttribute('alt')).toBe(':party:');
    expect(container.textContent).toContain(':missing:');
  });
});
