import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { WorkflowHttpMethod } from '@discord-clone/shared';
import { isPublicAddress } from '@/modules/link-previews/address-policy';
import { assertFetchableUrl } from '@/modules/link-previews/safe-fetch';

/**
 * The HTTP_CALL action's outbound fetcher. Reuses `link-previews`'s address-class policy and
 * DNS-pinning approach (every hop resolves through a `lookup` that rejects the whole hostname if any
 * resolved address is not public, then the socket connects to the address that lookup approved, so a
 * DNS answer cannot change between validation and connection) and adds a second, independent check
 * on every hop: the resolved hostname must also be on the caller-supplied allowlist. Both checks run
 * before every connect, including every redirect hop — neither an allowlist edit after save nor a
 * redirect to an unlisted or private host can bypass them.
 */
export type WorkflowHttpBlockReason = 'HOST_NOT_ALLOWED' | 'BLOCKED_ADDRESS';

export class WorkflowHttpBlockedError extends Error {
  constructor(
    readonly reason: WorkflowHttpBlockReason,
    message: string,
  ) {
    super(message);
  }
}

export class WorkflowHttpTimeoutError extends Error {}
export class WorkflowHttpTooLargeError extends Error {}

export interface WorkflowHttpCallOptions {
  method: WorkflowHttpMethod;
  body?: string;
  /** Opened plaintext, attached to every hop request; never logged. */
  secretHeader?: { name: string; value: string };
  /** Every hostname this server's allowlist currently permits (Changes -> Rules item 4). */
  allowedHostnames: string[];
  timeoutMs: number;
  maxRedirects: number;
  maxResponseBytes: number;
}

export interface WorkflowHttpCallResult {
  finalUrl: string;
  statusCode: number;
  /** Full body text, up to `maxResponseBytes`; the caller truncates further for run history. */
  body: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function callWorkflowHttp(
  rawUrl: string,
  options: WorkflowHttpCallOptions,
): Promise<WorkflowHttpCallResult> {
  const isAllowedHostname = (hostname: string) =>
    matchesAllowlist(options.allowedHostnames, hostname);
  const deadline = Date.now() + options.timeoutMs;
  let url = new URL(rawUrl);
  const bodyBuffer = options.method === 'POST' && options.body ? Buffer.from(options.body) : null;

  for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
    assertFetchableUrl(url);
    // Every hop is checked against the allowlist by hostname (Changes -> Rules item 4) and, via the
    // DNS-pinned lookup below, against the address-class policy -- an IP-literal host skips `lookup`
    // in Node, so it is checked here directly, exactly as `safe-fetch.ts` does for link previews.
    if (!isAllowedHostname(url.hostname)) {
      throw new WorkflowHttpBlockedError(
        'HOST_NOT_ALLOWED',
        `Host not in allowlist: ${url.hostname}`,
      );
    }
    const literalAddress = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(literalAddress) && !isPublicAddress(literalAddress)) {
      throw new WorkflowHttpBlockedError('BLOCKED_ADDRESS', 'Target is not a public address');
    }

    const response = await requestOnce(url, options, bodyBuffer, deadline);
    const location = response.headers.location;
    if (REDIRECT_STATUSES.has(response.statusCode ?? 0) && location) {
      response.resume();
      url = new URL(location, url);
      continue;
    }

    const body = await readLimitedBody(response, options.maxResponseBytes, deadline);
    return { finalUrl: url.toString(), statusCode: response.statusCode ?? 0, body };
  }

  throw new WorkflowHttpBlockedError('HOST_NOT_ALLOWED', 'Too many redirects');
}

/** An entry with a leading `*.` matches only a strict subdomain, never the bare domain itself. */
function matchesAllowlist(entries: string[], hostname: string): boolean {
  const target = hostname.toLowerCase();
  return entries.some((entry) => {
    const normalized = entry.toLowerCase();
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1);
      return target.endsWith(suffix) && target.length > suffix.length;
    }
    return target === normalized;
  });
}

function requestOnce(
  url: URL,
  options: WorkflowHttpCallOptions,
  bodyBuffer: Buffer | null,
  deadline: number,
): Promise<IncomingMessage> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0)
    return Promise.reject(new WorkflowHttpTimeoutError('Workflow HTTP call timed out'));

  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers: Record<string, string> = { 'user-agent': 'DiscordsWorkflow/1.0' };
  if (bodyBuffer) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(bodyBuffer.byteLength);
  }
  if (options.secretHeader) {
    headers[options.secretHeader.name] = options.secretHeader.value;
  }

  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: options.method,
        headers,
        lookup: validatedLookup(options.allowedHostnames),
        timeout: remainingMs,
      },
      resolve,
    );
    outgoing.on('timeout', () =>
      outgoing.destroy(new WorkflowHttpTimeoutError('Workflow HTTP call timed out')),
    );
    outgoing.on('error', (error) => reject(error));
    if (bodyBuffer) outgoing.write(bodyBuffer);
    outgoing.end();
  });
}

/**
 * Rejects the whole hostname if any resolved address is not public, so the caller connects only to
 * an address this same lookup already approved (never a later, different DNS answer).
 */
function validatedLookup(allowedHostnames: string[]): LookupFunction {
  return (hostname, dnsOptions, callback) => {
    if (!matchesAllowlist(allowedHostnames, hostname)) {
      callback(
        new WorkflowHttpBlockedError('HOST_NOT_ALLOWED', `Host not in allowlist: ${hostname}`),
        '',
        0,
      );
      return;
    }
    dnsLookup(hostname, { all: true, family: dnsOptions.family ?? 0 }, (error, addresses) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
        callback(
          new WorkflowHttpBlockedError('BLOCKED_ADDRESS', 'Target is not a public address'),
          '',
          0,
        );
        return;
      }
      if (dnsOptions.all) {
        (callback as unknown as (err: null, addresses: LookupAddress[]) => void)(null, addresses);
        return;
      }
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function readLimitedBody(response: IncomingMessage, maxBytes: number, deadline: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(
      () => response.destroy(new WorkflowHttpTimeoutError('Workflow HTTP call timed out')),
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
      size += chunk.length;
      if (size > maxBytes) {
        settle(new WorkflowHttpTooLargeError('Workflow HTTP response exceeded the byte cap'));
        response.destroy();
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => settle());
    response.on('error', (error) => settle(error));
  });
}
