import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { clearLinkPreviewCache } from '../../hooks/useLinkPreview';
import { LinkPreviewCard } from './LinkPreviewCard';

const auth: api.AuthState = {
  accessToken: 'token',
  refreshToken: 'refresh',
  user: { id: 'u1', email: 'u1@example.com', username: 'u1', displayName: 'U1' },
};

function renderCard(url: string, canFetchPreview: boolean) {
  return render(
    <LinkPreviewCard url={url} canFetchPreview={canFetchPreview} accessToken={auth.accessToken} />,
  );
}

describe('LinkPreviewCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearLinkPreviewCache();
  });

  it('replaces the chip with a card once a preview loads', async () => {
    vi.spyOn(api, 'apiRequest').mockResolvedValue({
      preview: {
        url: 'https://example.com/',
        hostname: 'example.com',
        siteName: null,
        title: 'Example Domain',
        description: 'An example page',
      },
    });

    renderCard('https://example.com', true);

    await waitFor(() => expect(screen.getByText('Example Domain')).toBeTruthy());
    expect(screen.getByText('example.com')).toBeTruthy();
  });

  it('never requests a preview when fetching is not allowed, such as for encrypted messages', () => {
    const request = vi.spyOn(api, 'apiRequest');

    renderCard('https://secret.example', false);

    expect(request).not.toHaveBeenCalled();
    expect(screen.getByTestId('link-preview').textContent).toContain('secret.example');
  });

  it('keeps the chip when the API has no preview', async () => {
    const request = vi.spyOn(api, 'apiRequest').mockResolvedValue({ preview: null });

    renderCard('https://nothing.example', true);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://nothing.example');
  });
});
