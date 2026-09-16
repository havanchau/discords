import { useQuery } from '@tanstack/react-query';
import { apiRequest, type LinkPreview } from '../api';
import { queryKeys } from '../query/queryKeys';

/**
 * The preview for a URL, or null when there is none (or it failed, or `enabled` is false).
 *
 * The same URL usually appears in several messages at once. React Query deduplicates the concurrent
 * reads and keeps the answer cached, which is what the module-level maps here used to do by hand.
 */
export function useLinkPreview(url: string, enabled: boolean, token: string) {
  const { data } = useQuery({
    queryKey: queryKeys.linkPreview(url),
    enabled: enabled && Boolean(token),
    // A link's preview does not change while the page is open.
    staleTime: Infinity,
    // A missing preview degrades to the plain link chip; nothing else depends on it.
    retry: false,
    queryFn: () =>
      apiRequest<{ preview: LinkPreview | null }>(
        `/link-previews?url=${encodeURIComponent(url)}`,
        {},
        token,
      ).then((result) => result.preview),
  });

  return enabled ? (data ?? null) : null;
}
