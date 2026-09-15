import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders formatting as elements', () => {
    const { container } = render(<MarkdownContent content="**bold** and `code`" />);

    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('code');
  });

  it('renders HTML in content as text without creating elements', () => {
    const { container } = render(<MarkdownContent content={'<img src=x onerror="alert(1)">'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('hides a spoiler until activated', () => {
    render(<MarkdownContent content="the answer is ||42||" />);

    const spoiler = screen.getByRole('button', { name: 'Spoiler, activate to reveal' });
    fireEvent.click(spoiler);

    expect(screen.queryByRole('button', { name: 'Spoiler, activate to reveal' })).toBeNull();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders resolved custom emoji and leaves unknown shortcodes as text', () => {
    const { container } = render(
      <MarkdownContent
        content=":party: :unknown:"
        resolveEmoji={(name) => (name === 'party' ? '/uploads/party.png' : undefined)}
      />,
    );

    const image = container.querySelector('img');
    expect(image?.getAttribute('alt')).toBe(':party:');
    expect(container.textContent).toContain(':unknown:');
  });

  it('opens links in a new tab without a referrer', () => {
    render(<MarkdownContent content="visit https://example.com" />);

    const link = screen.getByRole('link', { name: 'https://example.com' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });
});
