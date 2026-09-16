# Feature Spec: Realtime Scale-Out (Redis Adapter)

This specification covers making the API's Socket.IO realtime layer safe to run as more than one instance: a Redis adapter for cross-node broadcast, and moving the process-local presence, call, DM-ring, and rate-limit state that currently assumes a single process into Redis.

## Goal

Let `apps/api` run as more than one instance behind a load balancer without breaking presence accuracy, call membership/authorization, DM ringing, or rate limiting. Today the codebase and its own docs (`docs/architecture.md:175-176`, `docs/architecture.md:204`, `docs/deployment.md:165`) already say the API must stay single-instance until this exists.

**Acceptance criteria**:

- [ ] Two API instances can run simultaneously; a message sent by a user connected to instance A is received by a user connected to instance B (already true for `emitToRoom`/`emitToRooms` once the adapter is attached — verified as an acceptance case, not a new behavior).
- [ ] A user with tabs open on two different instances does not flip to OFFLINE when only one tab closes.
- [ ] Restarting or booting one instance never marks users connected to a healthy instance as OFFLINE.
- [ ] `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` relay succeeds when the two peers are connected to different instances (`assertPeer` no longer throws for a same-call peer on another node).
- [ ] A DM call ring started against instance A still auto-expires ("Missed call") if the ringing recipients are on instance B, and if instance A is killed mid-ring.
- [ ] Global HTTP rate limits and per-socket event rate limits enforce the same configured ceiling regardless of how many instances are running.
- [ ] `docs/architecture.md`, `docs/deployment.md` are updated in the same change that implements this.

## Scope

**In scope**

- Add Redis as a new infrastructure dependency (new `docker-compose.yml` service, new `REDIS_URL` env var).
- Attach `@socket.io/redis-adapter` to the existing Socket.IO server so cross-node broadcast works.
- Move `PresenceService` socket-tracking state to Redis.
- Replace the unscoped `resetStalePresence()` startup query with an instance-scoped mechanism.
- Move `CallRegistryService` call-membership state to Redis (needed for `assertPeer` to work cross-node).
- Move `DmCallRings` timers to a Redis-backed expiry mechanism.
- Make rate-limit counters (`FixedWindowLimiter` instances) shared across instances via Redis.
- Define key shapes, TTLs, and an instance-id scheme; define crash/abandoned-key handling.

**Out of scope**

- Replacing the WebRTC mesh with an SFU — see `voice-sfu.md`, which depends on this doc.
- Moving uploads off local disk (`apps/api/src/main.ts:32`, `api-uploads` volume in `docker-compose.yml`) — this remains a separate multi-instance blocker, not solved here (see Risks and `open-questions.md`).
- Any new product-facing feature.
- Splitting the API into microservices.
- Load balancer / sticky-session infrastructure setup itself (assumed to exist once this doc is deployed multi-instance; not designed here).

## Current Behavior

### What already works cross-node once an adapter is attached

`RealtimePublisherService` (`apps/api/src/modules/realtime/realtime-publisher.service.ts`) is a thin wrapper over the shared Socket.IO server; a Redis adapter makes every one of these methods cross-node automatically, with no code change:

- `emitToRoom` — `realtime-publisher.service.ts:12-14`
- `emitToRooms` — `realtime-publisher.service.ts:16-26`
- `joinUsersToRoom` — `realtime-publisher.service.ts:29-32` (`server.in(...).socketsJoin(...)`)
- `removeUsersFromRooms` — `realtime-publisher.service.ts:34-37` (`socketsLeave`)
- `disconnectSessions` — `realtime-publisher.service.ts:40-49` (`server.in(...).fetchSockets()` then `socket.disconnect(true)`)
- Room-name helpers — `realtime-publisher.service.ts:51-65` (`server:<id>`, `channel:<id>`, `conversation:<id>`, `user:<id>`)

The server is attached once, in `RealtimeGateway.afterInit`, at `apps/api/src/modules/realtime/realtime.gateway.ts:50` (`this.publisher.attach(server)`).

### Process-local state that breaks with more than one instance

1. **Presence socket tracking** — `PresenceService.userSockets`, `apps/api/src/modules/realtime/presence.service.ts:13`, a `Map<string, Set<string>>` of userId → socketIds. The class comment (lines 6-9) states presence is derived only from the sockets the current process holds. `socketConnected` (lines 21-30) flips a user ONLINE only when `sockets.size === 1`; `socketDisconnected` (lines 32-41) flips OFFLINE when the set empties. With two instances, a user with one tab on each instance goes OFFLINE the moment either tab closes, because each process only sees its own half of the sockets.
2. **`resetStalePresence()`** — `presence.service.ts:47-59`, invoked from `RealtimeGateway.afterInit` at `realtime.gateway.ts:69`. It runs `prisma.user.updateMany({ where: { status: 'ONLINE' }, data: { status: 'OFFLINE' } })` — unscoped across every user in the table. The comment at lines 43-46 justifies this for a single process on boot. **This is the most severe multi-instance bug**: booting or restarting instance B marks every user currently connected to instance A as OFFLINE.
3. **Call membership** — `CallRegistryService`, `apps/api/src/modules/realtime/call-registry.service.ts:30-31`: `callParticipants: Map<channelId, Map<socketId, CallParticipant>>` and `socketCalls: Map<socketId, Set<channelId>>`. The class comment (lines 24-27) states outright this is process-local state, "which is also why the API runs as a single instance." Methods: `join` (40-52), `updateState` (54-71), `leave` (73-96), `leaveAll` (98-101), `assertPeer` (103-108), `getActiveCallSummary` (110-123), `emitActiveCall` (126-138). `callRoom(channelId)` returns `call:<channelId>` (35-37). `assertPeer` is the authorization gate for WebRTC relay (`voice.gateway.ts:136-176`) and depends entirely on this in-memory map — with two instances it throws for a peer connected to the other node.
4. **DM call rings** — `DmCallRings`, `apps/api/src/modules/realtime/dm-call-rings.ts:22`, a `Map<conversationId, StoredRing>` where each ring holds a Node `setTimeout` (lines 11-13, 31-36), `DM_CALL_RING_TIMEOUT_MS = 30_000` (line 15). A `setTimeout` is process-local: on instance B the ring is invisible and never expires there, and a restart of the owning instance silently drops any pending ring. Used by `DmCallsService` (`apps/api/src/modules/realtime/dm-calls.service.ts`).
5. **Per-process rate limiters** — `FixedWindowLimiter` (`apps/api/src/common/fixed-window-limiter.ts`), an in-memory `Map<string, Bucket>` bounded by `DEFAULT_LIMITER_MAX_KEYS = 100_000`; evicted keys **fail open** per the comment at lines 17-20. Three separate instances exist today: the global HTTP limiter (`apps/api/src/main.ts:46`), the socket connection limiter (`realtime.gateway.ts:38`, used by `attachSocketGuards` at lines 52-55 with `maxConnectionsPerIp`), and the per-socket event limiter (`apps/api/src/modules/realtime/socket-rate-limit.service.ts:8`). With N instances behind a load balancer, every configured limit becomes effectively N times looser, since each instance counts independently. Config: `apps/api/src/common/limits-config.ts` (`TRUST_PROXY_HOPS`, `RATE_LIMIT_GLOBAL_PER_MINUTE` default 600, `SOCKET_MAX_CONNECTIONS_PER_IP` default 50), read through `readLimitsConfig`, which throws on a malformed value at startup.

### Connection lifecycle this design must not break

`apps/api/src/modules/realtime/realtime.gateway.ts`:

- `@WebSocketGateway` options (lines 26-32): CORS origin from `parseWebOrigins(process.env.WEB_ORIGIN || defaultWebOrigin)`, `maxHttpBufferSize: SOCKET_MAX_PAYLOAD_BYTES`.
- `afterInit` (lines 49-70): attaches the publisher, attaches socket guards, installs `server.use(...)` handshake middleware that authenticates via `SocketAuthService` and sets `socket.data.user` (lines 59-67) — the comment at 57-58 explains auth must run in the handshake, not `handleConnection`, to avoid a race.
- `handleConnection` (lines 72-87): joins `user:<id>`, joins every DM conversation room (`joinDirectConversationRooms`, lines 102-109), then `presence.socketConnected`.
- `handleDisconnect` (lines 89-99): `this.calls.leaveAll(client)` then `presence.socketDisconnected`.
- A crash never runs `handleDisconnect` — that is the reason `resetStalePresence` exists today. Any Redis design must independently handle abandoned entries left by a killed process (TTL / heartbeat), since a killed pod leaves its keys behind with no disconnect event to clean them up.

### Not solved here — local disk uploads

`apps/api/src/main.ts:32` resolves the uploads directory as `join(process.cwd(), 'uploads')`, served statically at `apps/api/src/main.ts:63-78`. `docker-compose.yml` mounts a single named volume `api-uploads` for the one `api` service. A file written on instance A is not readable from instance B unless storage is made shared (network volume) or all uploads go through Cloudinary. This is a **separate multi-instance blocker**, out of scope for this doc — tracked in `open-questions.md`.

## Changes

### Rules / Flow

1. **Redis adapter**: attach `@socket.io/redis-adapter` to the Socket.IO server in `RealtimeGateway.afterInit` (`realtime.gateway.ts:49`, right after `this.publisher.attach(server)`), using two `ioredis` connections (pub/sub, per the adapter's own requirement that the subscriber connection cannot issue other commands).
2. **Presence**: `PresenceService.userSockets` becomes a Redis **sorted set** per user, `presence:user:<userId>`, whose members are socket ids scored by the time of their last heartbeat. `socketConnected` does `ZADD`, prunes members scored older than the heartbeat TTL, and flips ONLINE when `ZCARD` is 1; `socketDisconnected` does `ZREM` and flips OFFLINE when `ZCARD` reaches 0. A second sorted set, `presence:online`, holds the user ids themselves so stale users can be found without scanning the keyspace.
3. **Stale presence reset**: `resetStalePresence()` is **removed outright** rather than made instance-scoped. Scoring every socket entry by its last heartbeat means a killed instance's entries simply stop being refreshed and fall out of the sorted set on the next prune. A periodic sweep (`sweepStaleUsers`) walks `presence:online` for users whose every socket went stale and flips them OFFLINE; removing the member from `presence:online` is the claim, so concurrent instances emit exactly one OFFLINE.
4. **Call registry**: `callParticipants` / `socketCalls` move into `call:<channelId>:participants` (hash: `socketId -> JSON participant`) and `socket:<socketId>:calls` (set of channelIds). Each stored participant carries its own `lastSeen` heartbeat; reads prune and delete members whose heartbeat went stale, so a killed instance cannot leave a ghost in a call. `assertPeer` checks the pruned participant list for both sockets, so it succeeds regardless of which instance holds either connection.
5. **DM call rings**: the in-process `setTimeout` is replaced by a ring key (`dm:ring:<conversationId>`, JSON value) plus a **deadline sorted set** `dm:ring-deadlines` scored by expiry time. A sweep reads members past their deadline and claims each one with `ZREM`: exactly one instance gets a non-zero reply, so a ring fires "missed" exactly once. This needs no `notify-keyspace-events` configuration on the Redis server, which the keyspace-notification option would have required. The ring key's own TTL is set to four times the ring timeout — it is only a leak guard and must outlive the deadline, or the sweep would find nothing left to report.
6. **Rate limiting**: the in-process bucket `Map` is replaced by a Redis counter incremented in a Lua script (`INCR`, then `PEXPIRE` only when the counter was just created, so later hits never extend the window). Four call sites switch: the global HTTP middleware, the `RateLimitGuard` route limiter, the socket connection/event guards, and the per-event `SocketRateLimitService`. Two behavior changes follow: the old `DEFAULT_LIMITER_MAX_KEYS` eviction and its fail-open no longer exist (Redis TTL replaces them), and a failed Redis call now **denies** the request. The count of concurrently open sockets per IP stays process-local on purpose — it is decremented on transport close, and a shared counter would leak on every killed instance with no close event to balance it.
7. **Instance id**: each API process takes `INSTANCE_ID` from the environment or generates a `randomUUID()` at boot. With heartbeat scoring, no key needs to be attributed to its creator for cleanup, so this is now only used to make a restart traceable in the logs.
8. **Redis unavailability**: the API **fails closed** for anything Redis now owns — new socket connections are refused during the handshake middleware if the adapter/rate-limit Redis connection is down (a clear `503`-style rejection over the socket handshake), rather than silently falling back to process-local state, because process-local fallback under multi-instance would reintroduce every bug this doc fixes. This is the trade-off named below: it turns a Redis outage into a realtime outage rather than a silent correctness regression.

### Edge cases

| Case                                            | Expected behavior                                                                                                                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redis unreachable at boot                       | API refuses to start (fail closed) rather than silently degrading to single-instance-only in-memory state.                                                                                                                                                     |
| Redis connection drops mid-run                  | New socket handshakes are rejected until Redis recovers; already-connected sockets keep working for existing rooms (adapter buffers per `socket.io-redis-adapter` semantics) but new joins/relays that need a Redis round-trip fail loudly, logged as `error`. |
| Instance killed without clean disconnect        | Presence and call-participant keys expire via TTL rather than waiting for `handleDisconnect`; a heartbeat renews the TTL only while the instance is alive.                                                                                                     |
| Two tabs, two instances, one tab closes         | User stays ONLINE (`presence:user:<userId>` set still has one member).                                                                                                                                                                                         |
| DM ring instance dies mid-ring                  | Ring key and its TTL live in Redis, independent of the process; another instance's timer/sweeper (or the ring owner's replacement) can still fire "missed call" when the TTL elapses.                                                                          |
| `assertPeer` for a peer on a different instance | Succeeds via the shared `call:<channelId>:participants` hash instead of throwing.                                                                                                                                                                              |

## Technical Approach

**Files touched**

| File                                                                                                                             | Change                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/package.json`                                                                                                          | Add `@socket.io/redis-adapter` and `ioredis`.                                                                                                                          |
| `apps/api/src/common/limits-config.ts`                                                                                           | Add `REDIS_URL` to the typed config schema (or a sibling `redis-config.ts` following the same pattern).                                                                |
| `.env.example` (repo root)                                                                                                       | Add `REDIS_URL` with a dummy local value.                                                                                                                              |
| `docker-compose.yml`                                                                                                             | Add a `redis` service (pinned image tag) and `depends_on: redis` on the `api` service.                                                                                 |
| `apps/api/src/modules/realtime/realtime.gateway.ts`                                                                              | Attach the Redis adapter in `afterInit` (near line 50); reject handshakes when Redis is down.                                                                          |
| `apps/api/src/modules/realtime/presence.service.ts`                                                                              | Replace `Map`-based tracking with Redis sets/keys; replace `resetStalePresence`.                                                                                       |
| `apps/api/src/modules/realtime/call-registry.service.ts`                                                                         | Replace in-memory maps with Redis hashes/sets; `assertPeer` reads from Redis.                                                                                          |
| `apps/api/src/modules/realtime/dm-call-rings.ts`                                                                                 | Replace `setTimeout`-based rings with Redis keys + TTL and an expiry-driven callback.                                                                                  |
| `apps/api/src/common/redis-fixed-window-limiter.ts`                                                                              | New Redis-backed limiter. `apps/api/src/common/fixed-window-limiter.ts` is deleted once its last call site is gone.                                                    |
| `apps/api/src/common/rate-limit.guard.ts`, `global-rate-limit.middleware.ts`, `socket-guards.ts`, `socket-rate-limit.service.ts` | Switch to the shared limiter; `canActivate` and the socket guards become async.                                                                                        |
| `apps/api/src/modules/realtime/realtime-heartbeat.service.ts`                                                                    | New: refreshes this instance's presence/call entries and runs the stale and ring sweeps.                                                                               |
| `apps/api/src/modules/redis/`                                                                                                    | New module: the shared client, the adapter's pub/sub pair, and the key prefix.                                                                                         |
| `docs/architecture.md`                                                                                                           | Check off the "Redis adapter" checklist item (line 204) and update the Scaling Rules section (lines 175-176) to describe the shipped design instead of the aspiration. |
| `docs/deployment.md`                                                                                                             | Update line 165 to describe the multi-instance-safe deployment instead of "keep the API to one instance".                                                              |

**Libraries**

- `@socket.io/redis-adapter` — the official Socket.IO cross-node adapter; matches the existing `socket.io` 4.8.3 major version already in `apps/api/package.json`.
- `ioredis` — chosen over the `redis` (node-redis) client because `@socket.io/redis-adapter`'s own documented setup uses either; `ioredis` is picked here for its built-in cluster/sentinel support, useful if the managed Redis in `open-questions.md` turns out to need it, and for its more ergonomic pipeline/Lua-script API needed for the atomic `INCR`+`PEXPIRE NX` rate-limit primitive.

**Redis key shapes and TTLs**

Every key is prefixed with `REDIS_KEY_PREFIX` (default `discord`) so several deployments can share one Redis.

| Key                             | Type                                                  | TTL                               | Purpose                                                        |
| ------------------------------- | ----------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `presence:user:<userId>`        | sorted set, member = socketId, score = last heartbeat | 2x heartbeat TTL                  | Cross-instance online/offline derivation.                      |
| `presence:online`               | sorted set, member = userId, score = last heartbeat   | none                              | Lets the stale sweep find users without scanning the keyspace. |
| `call:<channelId>:participants` | hash (`socketId -> JSON participant with lastSeen`)   | 2x heartbeat TTL                  | Cross-instance call membership and `assertPeer`.               |
| `socket:<socketId>:calls`       | set of channelIds                                     | 2x heartbeat TTL                  | Reverse index for `leaveAll`.                                  |
| `dm:ring:<conversationId>`      | string (JSON ring state)                              | 4x ring timeout (leak guard only) | Ring readable by any instance.                                 |
| `dm:ring-deadlines`             | sorted set, member = conversationId, score = expiry   | none                              | Drives ring expiry and claims it exactly once.                 |
| `ratelimit:<key>`               | integer counter                                       | the window length                 | Shared fixed-window rate limiting.                             |

**Timings**: heartbeat every 30s, entries considered stale after 90s, DM ring deadlines swept every 2s so a missed call is not reported late.

## Trade-offs

| Option                                                                                    | Pros                                                                                                                                                                                                            | Cons                                                                                                                                                                                                                                                                    | Verdict                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redis adapter + Redis-backed state (chosen)**                                           | Broadcast layer (`realtime-publisher.service.ts`) needs zero code change — the adapter alone makes it cross-node; well-documented Socket.IO pattern; also solves rate limiting and call state in one dependency | New infrastructure dependency and operational surface; Redis becomes a new single point of failure for realtime                                                                                                                                                         | Chosen: cheapest path given how much of the codebase already routes broadcasts through one publisher abstraction                                                                                                        |
| Sticky sessions only (no adapter, LB pins a user to one instance)                         | No new dependency                                                                                                                                                                                               | Does not fix presence across a user's multiple devices/tabs landing on different instances; does not fix cross-instance WebRTC relay when two different users' sockets land on different instances (the common case); one instance restart still drops all its sessions | Ruled out: solves load distribution, not correctness, and the codebase needs cross-node relay between _different_ users' sockets, which stickiness by definition cannot provide                                         |
| Postgres `LISTEN`/`NOTIFY` for broadcast instead of Redis                                 | No new infrastructure, reuses the existing Postgres dependency                                                                                                                                                  | Payload size limits, no built-in adapter for Socket.IO (would need a custom adapter), does not give a natural primitive for TTL-based presence/call-membership expiry the way Redis does, adds broadcast load to the primary datastore                                  | Ruled out: would still need to hand-roll presence/call/rate-limit TTL logic on top of a database not designed for it                                                                                                    |
| Call state in Postgres instead of Redis                                                   | Durable, already-audited store                                                                                                                                                                                  | Call participant churn (join/leave/mute/unmute) is much higher write volume than Postgres call tables are used for elsewhere in this repo; adds write latency to a hot signaling path (`webrtc:offer`/`answer` are rate-limited to 30/60s per socket, i.e. frequent)    | Ruled out: Redis is a better fit for short-lived, high-churn membership state that does not need durability past the call's lifetime                                                                                    |
| Shared rate-limit counters via Redis (chosen) vs. accepting N× looser limits per instance | Correct, uniform limits regardless of instance count                                                                                                                                                            | Adds one Redis round-trip per rate-limited request/event, on top of already-rate-limited hot paths (`webrtc:ice-candidate` is 120/60s)                                                                                                                                  | Chosen: an abuse ceiling that scales with instance count silently defeats the point of `docs/features/ddos-protection.md`; the round-trip cost is judged acceptable against that risk, but should be watched under load |

**What this costs**: one new infrastructure dependency to operate and monitor (Redis), one new failure mode (Redis down = realtime unavailable, by design — see fail-closed decision above), and every hot signaling path (`webrtc:offer`/`answer`/`ice-candidate`, presence join/leave) now does at least one Redis round-trip it did not do before. The actual broadcast/room code (`realtime-publisher.service.ts`) is unchanged, which keeps the blast radius of this change to the presence, call-registry, DM-ring, and rate-limit modules only.

## Risks & Rollback

- **What can break**: Redis becomes a new single point of failure for all realtime features (chat delivery, presence, calls) since the fail-closed design refuses to boot and denies rate-limited requests when Redis is unreachable; a participant whose instance died still shows in a call until their heartbeat goes stale, up to 90s; the DM ring sweep runs on a 2s interval, so a missed call can be reported up to 2s late.
- **Not covered**: the uploads local-disk blocker (`apps/api/src/main.ts:32`) remains — true multi-instance file access is not solved by this doc; an SFU for voice (see `voice-sfu.md`) is a separate follow-on.
- **Rollback**: this is a code-and-infrastructure change with no destructive migration — reverting the code revert and removing the `redis` compose service returns the API to single-instance-only operation with the pre-existing in-memory implementations intact (they are being replaced, not deleted-and-redesigned, so the previous classes can be restored file-for-file if reverted before any dependent later work lands).

## Test Plan

**Automated**

- Not covered by automated tests per `RULE.md:78` (this repo forbids `*.test.ts`/`*.spec.ts` files and test runners). Verify with `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run docs:check`.

**Manual**

All of the following were run against two local instances (ports 4000/4001) sharing one Redis and one
Postgres, using throwaway socket clients and the seeded `demo` / `teammate` users. Scenarios 1-6 and
the crash case passed; none of it is committed, per `RULE.md:78`.

1. `docker compose up -d postgres redis` then start two API processes locally on different ports (`PORT=4000` and `PORT=4001`) pointed at the same `REDIS_URL` and `DATABASE_URL`, with the web client's socket URL alternated between them (or a local reverse proxy round-robining both) — confirm a chat message sent by a client on instance A arrives for a client on instance B.
2. Open two browser tabs for the same user, connect one to instance A and one to instance B; close the instance-A tab; confirm the user's presence indicator stays ONLINE (does not flip via instance B's `socketDisconnected`).
3. Kill instance B (`kill -9` its process) while a user is only connected to instance A; confirm the instance-A user's status does not flip to OFFLINE (this is the `resetStalePresence` regression check).
4. Start a voice call with two participants connected to different instances; confirm `webrtc:offer`/`answer`/`ice-candidate` relay succeeds (video/audio connects) rather than `assertPeer` throwing.
5. Start a DM ring from instance A, then kill instance A before 30 seconds elapse; confirm the ring still expires into "Missed call" for the recipient connected to instance B.
6. Hammer the socket event rate limit (e.g. repeat `webrtc:ice-candidate` past 120/60s) from clients balanced across both instances; confirm the combined ceiling is enforced once, not once per instance.
7. Stop the Redis container while both instances are running; confirm existing connections keep working for already-joined rooms but a brand-new socket handshake is rejected with a clear error, and confirm logs show an `error`-level entry, not silent degradation.

## Deployment Notes

- New env vars: `REDIS_URL` (required — the API refuses to boot without it) and the optional `REDIS_KEY_PREFIX` and `INSTANCE_ID`. Add them to `.env.example` (repo root) and to production config once a Redis provider is chosen (see `open-questions.md`).
- **This is a breaking deployment change**: an existing environment that does not set `REDIS_URL` will fail to start after this ships. Provision Redis before deploying the code.
- `docker-compose.yml`: add the `redis` service and `depends_on` on `api`; no changes to `web` or `postgres` services.
- No database migration in this change (presence/call/ring/rate-limit state moves to Redis, not to new Postgres tables).
- `docs/architecture.md:175-176,204` and `docs/deployment.md:165` must be updated in the same change that implements this design — they currently describe the pre-Redis constraint as a live rule.
- Breaking change: none to the public API contract; this is an internal infrastructure change. Running the API with more than one instance before this ships must continue to be avoided, per the existing `docs/deployment.md:165` rule, until this lands.
- Depended on by `voice-sfu.md` — an SFU media server issuing per-participant tokens needs the API's authorization path (`assertPeer`-equivalent) to already work across instances.
