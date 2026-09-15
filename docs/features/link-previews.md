# Feature Spec: Link Previews

Title and description cards for links posted in messages, fetched by the API with SSRF protection.

## Goal

Links in channel and direct messages show a compact card with the page's site name, title, and description.

Acceptance criteria:

- `GET /link-previews?url=` returns `{ preview: { url, hostname, siteName, title, description } | null }`.
- The API only connects to public IP addresses on ports 80/443, re-validates every redirect (at most 3), and pins the connection to the validated address so DNS rebinding cannot redirect it.
- Fetches time out after 5 seconds, read at most 512 KB, and only parse `text/html` responses.
- Results are cached for 1 hour (failures for 10 minutes), at most 500 entries.
- The client shows up to 3 cards per message, never requests previews for end-to-end encrypted messages, and keeps the plain link chip while loading or when no preview exists.

## Scope

- **In scope**: preview endpoint, HTML metadata parser, private address checks, preview cards in channel and DM rows.
- **Out of scope**: preview images and video embeds (they would load third-party content in viewers' browsers without an image proxy), oEmbed, persisting previews, disabling previews per user.

## Current Behavior

- `MessageContent` renders each link as a chip with the URL text (`components/chat/MessageRow.tsx:141`, `data-testid="link-preview"`).
- The API makes no outbound HTTP requests except email and Cloudinary.

## Changes

### Address rules

`isPublicAddress(ip)` (pure) rejects:

- IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`.
- IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`, `64:ff9b::/96`; IPv4-mapped addresses are checked as IPv4.

A hostname is rejected if any resolved address is not public.

### Fetch rules

- Only `http:` and `https:`; no credentials in the URL; explicit ports other than 80/443 are rejected.
- Request headers: `User-Agent: DiscordsLinkPreview/1.0`, `Accept: text/html`.
- Non-2xx, non-HTML, oversized, timed-out, or blocked responses produce `preview: null` (cached as a failure). Only a malformed `url` query returns `400`.
- URLs are not logged, since they may be private.

### Metadata

`parseHtmlMetadata(html)` (pure) reads `og:title` → `twitter:title` → `<title>`, `og:description` → `description` → `twitter:description`, and `og:site_name`. Basic entities are decoded; title is cut to 200 characters and description to 300. No title and no description means no preview.

### Client

- `useLinkPreview(url, enabled, accessToken)` keeps a module-level cache and in-flight de-duplication, so the same URL in many rows makes one request. Rows pass their access token explicitly, so message rows keep rendering without an auth context provider.
- `LinkPreviewCard` renders site name, title (link), and description; it carries `data-testid="link-preview"` like the chip it replaces.
- Channel rows skip previews when `message.isEncrypted` is true.

## Technical Approach

### API

| Method | Path | Query | Response | Rate limit |
| --- | --- | --- | --- | --- |
| `GET` | `/link-previews` | `url` (http/https, ≤ 2048 chars) | `{ preview }` | 60/min |

### Files

- API: `modules/link-previews/link-previews.module.ts`, `link-previews.controller.ts`, `link-previews.service.ts` (cache and orchestration), `safe-fetch.ts` (validated lookup, redirects, limits), `address-policy.ts` (+ test), `html-metadata.ts` (+ test), `dto/link-preview-query.dto.ts`, `app.module.ts`.
- Web: `api.ts`, `hooks/useLinkPreview.ts`, `components/chat/LinkPreviewCard.tsx` (+ test; renders the chip until a preview exists), `LinkPreviewCard.module.css` (chip styles move here from `MessageRow.module.css`), `MessageRow.tsx`, `components/home/DirectMessageRow.tsx`, `DirectMessageTimeline.tsx`.

No new dependency: Node `http`, `https`, and `dns` cover fetching.

## Trade-offs

- **Server-side fetch vs. client-side fetch**: browsers cannot read cross-origin HTML, and fetching from the client would reveal every viewer's IP to linked sites. Cost: the API becomes an outbound fetcher, which is why the address policy and limits exist.
- **No images**: rendering `og:image` would load third-party images in every viewer's browser (tracking); a proper fix is an image proxy, left for later.
- **In-memory cache vs. database or Redis**: previews are cheap to recompute and non-critical; TTL expiry is the invalidation plan. Cost: each API instance caches separately.

## Risks & Rollback

- **Risk**: an attacker-controlled public site can still receive requests from the API's IP; rate limiting bounds this.
- **Rollback**: remove `LinkPreviewCard` usage (chips remain) or unregister the module.

## Test Plan

- **Automated**: `address-policy.test.ts` (each range, mapped IPv6, public addresses allowed); `html-metadata.test.ts` (priority order, entities, truncation, missing tags, attribute order); `safe-fetch.test.ts` with a local HTTP server proving IP-literal and DNS-resolved loopback targets are refused, redirects to private addresses are refused, non-HTML returns null, and the byte limit holds. Node skips the custom `lookup` for IP-literal hosts, so those are validated before connecting.
- **Manual**: post `https://example.com` → card appears; post `http://127.0.0.1:3000/health` and `http://localhost` → only the chip appears; encrypted channel → no request in the network panel.

## Deployment Notes

- The API host needs outbound HTTP/HTTPS egress. No new environment variables.
