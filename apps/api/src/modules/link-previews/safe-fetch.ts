import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isPublicAddress } from './address-policy';

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  /** Injectable for tests; production always uses the public-address policy. */
  isAllowedAddress?: (address: string) => boolean;
  /** Test-only: local test servers listen on ephemeral ports. */
  allowNonDefaultPorts?: boolean;
}

export interface SafeFetchResult {
  finalUrl: string;
  html: string;
}

export class BlockedUrlError extends Error {}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Only http(s), no credentials, default ports only. */
export function assertFetchableUrl(url: URL, allowNonDefaultPorts = false) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs can be previewed');
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('URLs with credentials cannot be previewed');
  }
  if (!allowNonDefaultPorts && url.port && url.port !== '80' && url.port !== '443') {
    throw new BlockedUrlError('Only default ports can be previewed');
  }
}

/*
 * Fetches an HTML page for metadata. Every hop resolves DNS through a lookup that rejects the whole
 * hostname if any address is not allowed, and the socket connects to the address that lookup
 * approved, so a DNS answer cannot change between validation and connection.
 */
export async function safeFetchHtml(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult | null> {
  const isAllowedAddress = options.isAllowedAddress ?? isPublicAddress;
  const deadline = Date.now() + options.timeoutMs;
  let url = new URL(rawUrl);

  for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
    assertFetchableUrl(url, options.allowNonDefaultPorts);
    // Node connects to IP-literal hosts without calling `lookup`, so they are checked here.
    const literalAddress = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(literalAddress) && !isAllowedAddress(literalAddress)) {
      throw new BlockedUrlError('Link preview target is not a public address');
    }
    const response = await requestOnce(url, deadline, isAllowedAddress);
    const location = response.headers.location;

    if (REDIRECT_STATUSES.has(response.statusCode ?? 0) && location) {
      response.resume();
      url = new URL(location, url);
      continue;
    }

    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    const isHtml =
      contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
    if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300 || !isHtml) {
      response.resume();
      return null;
    }

    const html = await readLimitedBody(response, options.maxBytes, deadline);
    return { finalUrl: url.toString(), html };
  }

  return null;
}

function requestOnce(
  url: URL,
  deadline: number,
  isAllowedAddress: (address: string) => boolean,
): Promise<IncomingMessage> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new Error('Link preview timed out'));

  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: 'GET',
        headers: { 'user-agent': 'DiscordsLinkPreview/1.0', accept: 'text/html' },
        lookup: validatedLookup(isAllowedAddress),
        timeout: remainingMs,
      },
      resolve,
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('Link preview timed out')));
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function validatedLookup(isAllowedAddress: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true, family: options.family ?? 0 }, (error, addresses) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      const resolved = addresses;
      if (!resolved.length || resolved.some((entry) => !isAllowedAddress(entry.address))) {
        callback(new BlockedUrlError('Link preview target is not a public address'), '', 0);
        return;
      }
      if (options.all) {
        (callback as unknown as (err: null, addresses: LookupAddress[]) => void)(null, resolved);
        return;
      }
      callback(null, resolved[0].address, resolved[0].family);
    });
  };
}

function readLimitedBody(response: IncomingMessage, maxBytes: number, deadline: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(
      () => response.destroy(new Error('Link preview timed out')),
      Math.max(0, deadline - Date.now()),
    );

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };

    response.on('data', (chunk: Buffer) => {
      const remaining = maxBytes - size;
      chunks.push(chunk.subarray(0, remaining));
      size += Math.min(chunk.length, remaining);
      // Metadata lives in <head>; stop downloading once the byte budget is spent.
      if (size >= maxBytes) {
        settle();
        response.destroy();
      }
    });
    response.on('end', () => settle());
    response.on('error', (error) => settle(error));
  });
}
