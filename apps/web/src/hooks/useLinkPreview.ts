import { useEffect, useState } from 'react';
import { apiRequest, type LinkPreview } from '../api';

// Shared across rows so the same URL in many messages is requested once per page session.
const previewCache = new Map<string, LinkPreview | null>();
const inflightRequests = new Map<string, Promise<LinkPreview | null>>();

function loadPreview(url: string, token: string) {
  const inflight = inflightRequests.get(url);
  if (inflight) return inflight;

  const request = apiRequest<{ preview: LinkPreview | null }>(
    `/link-previews?url=${encodeURIComponent(url)}`,
    {},
    token,
  )
    .then((result) => {
      previewCache.set(url, result.preview);
      return result.preview;
    })
    .finally(() => inflightRequests.delete(url));
  inflightRequests.set(url, request);
  return request;
}

/** The preview for a URL, or null when there is none (or it failed, or `enabled` is false). */
export function useLinkPreview(url: string, enabled: boolean, token: string) {
  const [preview, setPreview] = useState<LinkPreview | null>(() => previewCache.get(url) ?? null);

  useEffect(() => {
    if (!enabled || !token) return;
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null);
      return;
    }
    let isCurrent = true;
    loadPreview(url, token)
      .then((result) => {
        if (isCurrent) setPreview(result);
      })
      .catch(() => {
        // A missing preview degrades to the plain link chip; nothing else depends on it.
        if (isCurrent) setPreview(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [url, enabled, token]);

  return enabled ? preview : null;
}

/** Test hook: previews are cached for the page session. */
export function clearLinkPreviewCache() {
  previewCache.clear();
  inflightRequests.clear();
}
