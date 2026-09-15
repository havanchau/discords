import { Injectable, Logger } from '@nestjs/common';
import { parseHtmlMetadata } from './html-metadata';
import { BlockedUrlError, safeFetchHtml } from './safe-fetch';

export interface LinkPreview {
  url: string;
  hostname: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
}

interface CacheEntry {
  expiresAt: number;
  preview: LinkPreview | null;
}

const SUCCESS_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const FETCH_OPTIONS = { timeoutMs: 5000, maxBytes: 512 * 1024, maxRedirects: 3 };

@Injectable()
export class LinkPreviewsService {
  private readonly logger = new Logger(LinkPreviewsService.name);
  // TTL expiry is the invalidation plan; insertion order lets the oldest entry go first.
  private readonly cache = new Map<string, CacheEntry>();

  async getPreview(url: string, now = Date.now()) {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > now) return { preview: cached.preview };

    const preview = await this.fetchPreview(url);
    this.remember(url, preview, now);
    return { preview };
  }

  private async fetchPreview(url: string): Promise<LinkPreview | null> {
    try {
      const result = await safeFetchHtml(url, FETCH_OPTIONS);
      if (!result) return null;
      const metadata = parseHtmlMetadata(result.html);
      if (!metadata.title && !metadata.description) return null;
      const finalUrl = new URL(result.finalUrl);
      return { url: finalUrl.toString(), hostname: finalUrl.hostname, ...metadata };
    } catch (error) {
      // Unreachable or blocked targets are an expected outcome, not a server fault. URLs are not
      // logged because they may point at private resources.
      if (!(error instanceof BlockedUrlError)) {
        this.logger.debug(
          `Link preview fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      return null;
    }
  }

  private remember(url: string, preview: LinkPreview | null, now: number) {
    this.cache.delete(url);
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(url, {
      preview,
      expiresAt: now + (preview ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
    });
  }
}
