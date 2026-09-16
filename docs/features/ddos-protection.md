# Feature Spec: DDoS and Abuse Protection

Hardens the API against request floods, connection floods, and slow-client attacks at the application layer, and closes a rate-limit bypass.

## Goal

A single client (one IP, or one account over many sockets) cannot exhaust API CPU, memory, database connections, or socket capacity.

Acceptance criteria:

- Changing `X-Forwarded-For` on each request no longer resets the HTTP rate limit.
- One IP is capped across **all** HTTP requests, including unknown routes (404), `/uploads/*` static files, and requests rejected before reaching a controller.
- `429` responses carry a `Retry-After` header.
- Slow-header / slow-body clients (slowloris) are disconnected by server timeouts.
- One IP cannot open unlimited Socket.IO connections, and one socket cannot send unlimited events or oversized payloads.
- Socket per-event limits survive a reconnect (keyed by user, not socket id).
- The in-memory limiter has a bounded size under a many-IP flood.

## Scope

- **In scope**: API bootstrap (`main.ts`), HTTP rate-limit guard, a new global per-IP middleware, a shared in-memory limiter, Socket.IO connection/event/payload limits, Node HTTP server timeouts, docker `nginx.conf` request/connection limits, `.env.example`, `docs/security-check.md`, `docs/deployment.md`.
- **Out of scope**:
  - Volumetric L3/L4 DDoS (SYN flood, UDP amplification, bandwidth saturation). This cannot be solved inside the app; it needs the edge (Render/Vercel built-in protection, or Cloudflare in front of the API). Documented as a deployment recommendation only.
  - Distributed limiter shared across API instances (Redis). The API currently runs as one instance and does not use Redis.
  - CAPTCHA / proof-of-work on auth endpoints.
  - Changing existing per-route limits (auth, messages, uploads, …).

## Current Behavior

What already exists:

- `RateLimitGuard` registered as `APP_GUARD` (`apps/api/src/app.module.ts:47`), fixed window, in memory. Default `120 req / 60s` per IP **per route**; stricter limits via `@RateLimit` on auth, messages, uploads, servers, events, emojis, friend requests, DM actions, link previews.
- Socket per-event limits via `assertSocketRateLimit` (`apps/api/src/modules/realtime/realtime.gateway.ts:647`) on 16 events.
- Body size limits: JSON `256kb`, urlencoded `64kb` (`apps/api/src/main.ts:45`); multer `fileSize` limits on uploads.
- `helmet`, CORS allowlist, `trust proxy = 1` (`apps/api/src/main.ts:31`).

Gaps:

1. **Rate-limit bypass (critical).** `getClientIp` (`apps/api/src/common/rate-limit.guard.ts:56`) uses the **first** `X-Forwarded-For` entry, which is whatever the client sends. Sending a random value per request gives every request a fresh bucket, disabling every HTTP limit, including login brute-force limits.
2. **No global per-IP cap.** The bucket key includes the route path, so one IP gets 120/min on every route separately. Guards only run for matched routes, so 404 floods, `/uploads/*` static reads, and body-parser work are unlimited.
3. **No `Retry-After`** header on `429`.
4. **No slow-client timeouts.** Node defaults apply: `headersTimeout` 60s, `requestTimeout` 300s. A few hundred slow connections can hold sockets open for minutes.
5. **Socket.IO**:
   - no per-IP connection limit; every connection runs JWT verify + several DB queries in `handleConnection` (`realtime.gateway.ts:77`);
   - `maxHttpBufferSize` is the default `1 MB` per message;
   - events without a limit (`channel:join`, `voice:leave`, …) can be spammed; `channel:join` hits the DB each time;
   - limits are keyed by `client.id`, so reconnecting resets them.
6. **Unbounded limiter map.** Buckets are only swept when expired; a flood from many IPs grows the map for up to the window length with no ceiling.
7. Docker `apps/web/nginx.conf` has no `limit_req` / `limit_conn` / timeouts, and `/socket.io/` does not forward `X-Forwarded-For`.

## Changes

### Client IP resolution

- Use `request.ip` only (Express resolves it from `X-Forwarded-For` according to `trust proxy`, taking the entry added by the trusted proxy, not the client's).
- `trust proxy` becomes configurable: `TRUST_PROXY_HOPS` (integer, default `1`, same as today). Render and the docker nginx each add exactly one hop.
- Socket.IO uses the same rule: the address at position `hops` from the right of `X-Forwarded-For`, falling back to `handshake.address`.

### Limits (defaults)

| Layer                        | Key                              | Limit                                               | On exceed                                  |
| ---------------------------- | -------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Global HTTP middleware (new) | IP                               | `600 req / 60s` (`RATE_LIMIT_GLOBAL_PER_MINUTE`)    | `429` + `Retry-After`, before body parsing |
| Route guard (existing)       | prefix + IP + method + route     | unchanged (default `120 / 60s`)                     | `429` + `Retry-After` (header is new)      |
| Socket connect (new)         | IP                               | `30 handshakes / 60s`                               | handshake rejected                         |
| Socket concurrent (new)      | IP                               | `50` open sockets (`SOCKET_MAX_CONNECTIONS_PER_IP`) | handshake rejected                         |
| Socket all events (new)      | user                             | `300 events / 60s`                                  | socket disconnected                        |
| Socket per event (existing)  | **user** + event (was socket id) | unchanged                                           | error ack (unchanged)                      |
| Socket payload (new)         | —                                | `maxHttpBufferSize` `256kb`                         | Socket.IO closes the connection            |

`600/min` global and `50` sockets per IP are deliberately generous so a whole office behind one NAT is not blocked; the per-route limits stay the precise control.

Why `256kb` socket payload: matches the JSON body limit; the largest legitimate payloads are message content and WebRTC SDP offers (a few KB).

### HTTP server timeouts

Set on the Node server returned by `app.getHttpServer()`:

- `headersTimeout = 20_000` ms
- `requestTimeout = 120_000` ms (single-file upload up to `UPLOAD_MAX_BYTES` still fits for normal connections; large files use chunk upload)
- `keepAliveTimeout = 65_000` ms (longer than the typical 60s load balancer idle timeout, avoiding 502s from reused dead connections)

Socket.IO long-lived connections are not affected by `requestTimeout` after the upgrade.

### Limiter memory bound

The shared limiter holds at most `100_000` keys. When full it sweeps expired buckets; if still full it evicts the oldest inserted keys. Eviction fails open for the evicted key (that client gets a fresh window), which is preferable to the process running out of memory.

### Docker nginx (`apps/web/nginx.conf`)

Applies only to the self-hosted docker compose setup (production uses Render/Vercel):

- `limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;` with `burst=40 nodelay` on `/api/` and `/uploads/`.
- `limit_conn_zone $binary_remote_addr zone=conn:10m;` with `limit_conn conn 50` on `/socket.io/`.
- `limit_req_status 429; limit_conn_status 429;`
- `client_header_timeout 15s; client_body_timeout 30s; send_timeout 30s;`
- `/socket.io/` forwards `X-Real-IP` and `X-Forwarded-For`.

## Technical Approach

New files:

- `apps/api/src/common/fixed-window-limiter.ts` — `FixedWindowLimiter` class: `hit(key, limit, windowMs, now)` returns `{ allowed, retryAfterSeconds }`; sweeps expired buckets every 60s and owns the size cap. Clock injectable.
- `apps/api/src/common/client-ip.ts` — `resolveForwardedIp(forwardedFor, remoteAddress, hops)` used by Socket.IO.
- `apps/api/src/common/limits-config.ts` — `readLimitsConfig(config)` reads and validates `TRUST_PROXY_HOPS`, `RATE_LIMIT_GLOBAL_PER_MINUTE`, `SOCKET_MAX_CONNECTIONS_PER_IP`; a non-integer or out-of-range value throws at startup. Shared by `main.ts` and the gateway.
- `apps/api/src/common/global-rate-limit.middleware.ts` — Express middleware factory using `FixedWindowLimiter`.
- `apps/api/src/modules/realtime/socket-guards.ts` — Socket.IO `server.use` handshake middleware (connect rate + concurrent count per IP) and per-socket `client.use` total event cap, to keep `realtime.gateway.ts` (716 lines) from growing much.

Changed files:

- `apps/api/src/main.ts` — read limits config; register global limiter as the first middleware (before helmet/body parsers); set server timeouts.
- `apps/api/src/common/rate-limit.guard.ts` — use `request.ip`; use `FixedWindowLimiter`; set `Retry-After`.
- `apps/api/src/modules/realtime/realtime.gateway.ts` — `maxHttpBufferSize` in `@WebSocketGateway`; attach socket guards in `afterInit`; `assertSocketRateLimit` keyed by user id through `FixedWindowLimiter`; remove per-socket key cleanup that no longer applies.
- `apps/web/nginx.conf` — see above.
- `docs/security-check.md`, `docs/deployment.md` — record the controls, the new optional env variables, and the edge recommendation.

`.env.example` is not updated: it is outside what this session is permitted to read. The variables are documented in `docs/deployment.md` instead.

No API contract change other than `429` gaining `Retry-After`. No DB change. No new dependency.

## Trade-offs

- **Custom limiter vs `@nestjs/throttler` / `express-rate-limit`.** The repo already has a working custom guard and decorator used on ~40 routes; swapping libraries would touch all of them for no functional gain. A small shared class removes the duplicated bucket logic between the guard and the gateway. Cost: we own the code.
- **In-memory vs Redis store.** In memory is correct for the current single Render instance and adds no latency or new failure mode. Cost: limits multiply by instance count if the API is scaled horizontally, and reset on restart. Redis is the follow-up when scaling out.
- **Fixed window vs sliding window / token bucket.** Fixed window allows up to 2× burst at a window boundary. Accepted: same algorithm as today, O(1) memory per key, and the goal is flood resistance, not precise quotas.
- **Global cap per IP** can hit legitimate users behind a shared NAT. Mitigated by the high default and env override.
- **App-layer only** does not stop volumetric attacks; that is explicitly the edge's job.
- **Disconnect on socket event flood** (instead of dropping events) frees server resources immediately; the client auto-reconnects and is then subject to the connect limit.

## Risks & Rollback

- Wrong `TRUST_PROXY_HOPS` on a host with a different proxy chain → all users share the proxy IP (hops too low) and hit the global cap, or IP spoofing returns (hops too high). Default `1` matches today and Render. Verify after deploy by checking that two different clients get separate limits.
- Docker compose exposes API port `3000` directly; a client hitting it directly can still spoof `X-Forwarded-For` with `trust proxy 1`. Not changed here (dev compose); production must only expose the API through its proxy.
- Existing nginx default `client_max_body_size 1m` already blocks uploads larger than 1 MB (including 2 MB chunks) through the docker proxy. Noted, not changed in this task.
- Node checks `headersTimeout` / `requestTimeout` on its `connectionsCheckingInterval` (30s, only settable when the server is created), so a slow-header client is closed 20–50s after connecting, not at exactly 20s. Previously up to ~90s.
- `requestTimeout 120s` may cut a very slow single-file upload; chunked upload is unaffected.
- Rollback: revert the commit. No data or schema to restore.

## Test Plan

No automated tests: the repository does not keep test files (`RULE.md`, Code Quality Rules).

Checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:file-size`, `npm run docs:check`.

Manual, against the built API (`PORT=3099 node dist/main.js`, local database). Calling the API directly makes the caller the trusted hop, so each request sends a spoofed entry followed by a fixed "proxy-added" address, the same shape Render forwards:

1. `for i in $(seq 1 125); do curl -s -o /dev/null -w '%{http_code}\n' -H "X-Forwarded-For: 10.0.0.$i, 198.51.100.7" localhost:3099/health; done | sort | uniq -c` → 120 × `200`, 5 × `429`; response has `Retry-After`. Result 2026-09-15: pass.
2. Same loop against 605 different unknown paths from one address → 600 × `404`, 5 × `429` with JSON body and `Retry-After`. Result: pass.
3. Socket.IO client opening 33 handshakes from one address within a minute → 30 connect, 3 fail with `Too many connection attempts`. Result: pass.
4. Raw TCP client sending one header line every 5s → `408 Request Timeout` and close after 49s. Result: pass.
5. Not run (needs authenticated sockets, which write session and presence rows): 51 concurrent authenticated sockets from one IP → the 51st fails; 301 events in a minute from one user → socket disconnected; payload over 256 KB → connection closed.
6. Not run: `apps/web/nginx.conf` with `nginx -t` inside the docker image (no nginx available locally).

## Deployment Notes

- Optional env: `TRUST_PROXY_HOPS` (default `1`), `RATE_LIMIT_GLOBAL_PER_MINUTE` (default `600`), `SOCKET_MAX_CONNECTIONS_PER_IP` (default `50`). No change needed on Render with defaults.
- No migration.
- Docker compose: rebuild the `web` image for the nginx change.
- Recommendation (not part of this change): put the API domain behind Cloudflare (or rely on Render's edge) for volumetric DDoS, and enable its rate limiting rules for `/auth/*`.
