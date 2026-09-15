import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { BlockedUrlError, safeFetchHtml } from './safe-fetch';

const html = '<html><head><title>Local page</title></head><body></body></html>';

describe('safeFetchHtml', () => {
  let server: Server;
  let origin: string;

  before(async () => {
    server = createServer((request, response) => {
      if (request.url === '/redirect-private') {
        response.writeHead(302, {
          location: `http://[::1]:${(server.address() as AddressInfo).port}/`,
        });
        response.end();
        return;
      }
      if (request.url === '/json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
        return;
      }
      if (request.url === '/large') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`<title>Big</title>${'x'.repeat(10_000)}`);
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const baseOptions = { timeoutMs: 2000, maxBytes: 512 * 1024, maxRedirects: 3 };

  it('refuses loopback targets under the default address policy', async () => {
    await assert.rejects(
      safeFetchHtml(`${origin}/`, { ...baseOptions, allowNonDefaultPorts: true }),
      BlockedUrlError,
    );
  });

  it('refuses hostnames that resolve to loopback', async () => {
    const port = (server.address() as AddressInfo).port;

    await assert.rejects(
      safeFetchHtml(`http://localhost:${port}/`, { ...baseOptions, allowNonDefaultPorts: true }),
      BlockedUrlError,
    );
  });

  it('refuses non-default ports by default', async () => {
    await assert.rejects(safeFetchHtml(`${origin}/`, baseOptions), /default ports/);
  });

  it('refuses non-http protocols and credentials', async () => {
    await assert.rejects(safeFetchHtml('file:///etc/passwd', baseOptions), BlockedUrlError);
    await assert.rejects(
      safeFetchHtml('https://user:pass@example.com/', baseOptions),
      BlockedUrlError,
    );
  });

  it('fetches HTML when the address policy allows the target', async () => {
    const result = await safeFetchHtml(`${origin}/`, {
      ...baseOptions,
      allowNonDefaultPorts: true,
      isAllowedAddress: () => true,
    });

    assert.equal(result?.html, html);
    assert.equal(result?.finalUrl, `${origin}/`);
  });

  it('re-validates redirect targets', async () => {
    await assert.rejects(
      safeFetchHtml(`${origin}/redirect-private`, {
        ...baseOptions,
        allowNonDefaultPorts: true,
        isAllowedAddress: (address) => address === '127.0.0.1',
      }),
      BlockedUrlError,
    );
  });

  it('returns null for non-HTML responses', async () => {
    const result = await safeFetchHtml(`${origin}/json`, {
      ...baseOptions,
      allowNonDefaultPorts: true,
      isAllowedAddress: () => true,
    });

    assert.equal(result, null);
  });

  it('stops reading at the byte limit', async () => {
    const result = await safeFetchHtml(`${origin}/large`, {
      ...baseOptions,
      maxBytes: 100,
      allowNonDefaultPorts: true,
      isAllowedAddress: () => true,
    });

    assert.equal(result?.html.length, 100);
  });
});
