# Feature Spec: Convention Enforcement and Scale Refactor

This specification covers a cross-cutting pass on the things that make the codebase cheaper to keep
changing: the checks CI actually enforces, the client/server API contract, the realtime gateway's
size, the server-state layer on the web, and five defects found while reviewing those areas.

## Goal

Remove the structural reasons this codebase gets more expensive per feature: an API contract that
only exists twice by hand, a single 712-line gateway every realtime change has to touch, and server
data held in hand-rolled `useState` caches. Plus fix the defects that review surfaced.

Acceptance criteria:

- `npm run lint` fails on any warning, and CI runs every check script the repo ships.
- Response shapes are declared once, in `packages/shared`, and the API's message formatter is
  annotated with that contract instead of returning whatever Prisma selected.
- No realtime file exceeds ~250 lines, and a gateway contains no direct Prisma access.
- A user with several tabs open stays `ONLINE` until the last one closes.
- Chunked uploads cannot be used to fill the disk, and cannot write into another user's upload.
- Every HTTP response body is byte-equivalent to before the change.

## Scope

- **In Scope**:
  1. `lint` gated at zero warnings; `check:file-size`, `docs:check`, `i18n:check`, `ui:scan` added to CI.
  2. Dead code removal in `AppShell.tsx` and the last `any` in the web app.
  3. Chunked upload: total-chunk cap, assembled-size verification, per-user chunk directories, TTL sweep, request DTO.
  4. Presence: reference-counted sockets per user, plus a stale-presence reset on boot.
  5. `docker-compose.yml`: unused Redis service removed, `JWT_SECRET` no longer hardcoded.
  6. `realtime.gateway.ts` split into three gateways and six services.
  7. API response contract moved to `packages/shared/src/api-contract.ts`; `formatMessage` annotated with it.
  8. React Query introduced, with `useNotifications`, `useServerEvents` and `useServerEmojis` migrated.
- **Out of Scope**:
  - Annotating the remaining API surfaces (servers, channels, DMs, friends, notifications) against the
    shared contract — see [Remaining work](#remaining-work).
  - Migrating the other 30 web hooks to React Query, in particular the message and DM paths, which are
    coupled to socket-driven optimistic updates.
  - Making the API horizontally scalable. Presence, call state and rate-limit counters are still
    process-local, so the API remains single-instance by design.
  - Code-splitting the 746 kB web bundle.

## Current behavior

### Checks

`package.json` ran `eslint .`, which exits 0 with warnings; 15 dead-code warnings had accumulated.
`.github/workflows/ci.yml` ran only `lint`, `typecheck`, `build` and `ui:smoke`, so
`check:file-size`, `docs:check`, `i18n:check` and `ui:scan` were manual.

### Contract

`packages/shared/src/types.ts:5` declared an `AuthUser` that nothing imported. The real contract
lived as 36 hand-written interfaces in `apps/web/src/api.ts`, and the API imported nothing from
`packages/shared`. `messages.service.ts` returned `{ ...message }` spreads, so the response shape was
whatever the Prisma query happened to select, with no declared type on either side.

### Realtime

`realtime.gateway.ts` was 712 lines with 22 `@SubscribeMessage` handlers covering messages, threads,
reactions, typing, unread, voice, DM ringing and WebRTC signaling. It made 17 direct `this.prisma.*`
calls alongside 15 service delegations, so presence, room membership and session validation existed
only at the socket layer and could not be reused from HTTP.

### Web server state

No data-fetching library: 193 `useState` calls across 302 files, with 33 hand-written hooks and
`AppShell.tsx` (815 lines) orchestrating them. Hooks such as `useServerEvents` guarded races with a
manual `serverIdRef` and duplicated loading/error bookkeeping.

### Defects

- `uploads.service.ts:145` rejected `totalChunks < 1` but had no upper bound, and `fileSize` was
  client-supplied and never compared against the bytes actually written. Abandoned chunk directories
  were only removed on successful completion.
- `uploads.service.ts:306` validated `uploadId` for character set only, so the directory was not
  scoped to the caller.
- `realtime.gateway.ts:104` set `status: 'OFFLINE'` on every disconnect, so closing one of several
  tabs marked the user offline. A restart left everyone who was connected stuck at `ONLINE`.
- `docker-compose.yml` declared a Redis service that no code reads, and pinned
  `JWT_SECRET: dev-secret-change-me`, which the production guard in `main.ts:34` cannot catch because
  compose does not set `NODE_ENV`.

## Changes

### Checks

`lint` becomes `eslint . --max-warnings 0`. CI gains the four check scripts between `typecheck` and
`build`. All 15 warnings are resolved by deleting unused destructured values and imports; the `any`
in `useWorkspaceNavigation.ts` becomes `ActiveDialog`, and its never-used `setChannelBadges`
parameter is dropped.

### Chunked upload

- `totalChunks` is capped at `ceil(maxUploadBytes / maxChunkBytes) + 1`.
- After assembly the real size is read with `stat()` and checked against `maxUploadBytes`; the
  attachment's `byteSize` now reports that measured size instead of the client's claim.
- The chunk directory becomes `<tmp>/<userId>/<uploadId>`, so callers cannot reach each other's
  uploads. Ids are checked before being used as path segments.
- Directories older than 6 hours are swept on the next chunk write by that user.
- `POST /uploads/chunks` takes an `UploadChunkDto`, so the global `ValidationPipe` applies to it.

### Presence

`PresenceService` keeps a `Map<userId, Set<socketId>>`. The first socket sets `ONLINE`, and only the
last one to close sets `OFFLINE`. On boot, every `ONLINE` user is reset to `OFFLINE`, since presence
is derived from sockets this process holds.

Presence now emits once to the union of the user's server rooms rather than once per server. A user
who shares several servers with the viewer previously received one `presence:update` per shared
server; the payload is unchanged and the client handler is idempotent.

### Realtime split

| File | Responsibility |
|---|---|
| `realtime.gateway.ts` | Connection lifecycle: authenticate, join rooms, presence |
| `messages.gateway.ts` | Channels, messages, threads, reactions, typing, unread |
| `voice.gateway.ts` | Voice membership, DM ringing, WebRTC relay |
| `socket-auth.service.ts` | Handshake token and session validation |
| `presence.service.ts` | Socket reference counting and presence broadcast |
| `realtime-access.service.ts` | Authorization queries for channels, conversations and calls |
| `realtime-unread.service.ts` | Unread recipients and per-channel counts |
| `call-registry.service.ts` | Call participants, active-call summary, peer assertion |
| `socket-rate-limit.service.ts` | Shared per-socket event budget |

Only the connection gateway implements `OnGatewayConnection`; the feature gateways use a bare
`@WebSocketGateway()` and attach to the same server, so the CORS and payload limits are declared once.
No gateway touches Prisma any more.

### Shared contract

The 36 interfaces move to `packages/shared/src/api-contract.ts`. `apps/web/src/api.ts` re-exports
them, so no consumer import changes. `AuthUser` is deleted as the unused duplicate of `User`;
`Channel.type` reuses the existing `ChannelType`; `PresenceUpdatePayload` moves to
`realtime-events.ts` with `status` typed as `UserStatus` rather than `string`.

`Message` is corrected to match what the API actually sends: `serverId` and `replyToMessageId` are
added, and the three E2EE fields are documented as client-side decoration.

`messages.service.ts` imports the contract as a type and `formatMessage` is annotated
`: Message`, listing every field explicitly and converting dates with `toISOString()`. The local
`ThreadSummary` (which had `lastReplyAt: Date`) is deleted in favour of the shared one.

Because the API now resolves `@discord-clone/shared`, the shared package must be built first:
`build:shared` is added, and both `build` and `typecheck` run it before the workspaces.

### React Query

`App.tsx` provides a `QueryClient` created once, configured in `query/queryClient.ts`: no refetch on
focus (socket events already keep lists live), 30s `staleTime`, and no retry on 4xx. Keys live in
`query/queryKeys.ts` and include every parameter that affects the result.

`useNotifications`, `useServerEvents` and `useServerEmojis` are migrated. Each keeps its exact public
API, so no consumer changes. Socket events now call `invalidateQueries` instead of re-running a
loader, and the `serverIdRef` race guards are gone because the server id is part of the query key.
`useNotifications` stays lazy: the query is disabled until the notifications panel first asks for it.

## Technical approach

The split and the contract work were done so that every response body stays identical:

- Gateways keep their event names, payloads and acknowledgement shapes; handlers were moved, not
  rewritten. `SocketRateLimitService` reproduces the previous key format and message exactly.
- `formatMessage` was changed from a spread to an explicit field list, which is the risky part. It was
  verified by capturing `GET /channels/:id/messages` from the running API before and after and
  comparing the sorted key sets (see [Test plan](#test-plan)).

## Trade-offs

**Splitting the gateway into 3 + 6 files rather than leaving it whole.** More files to navigate, and
an event handler and the query it depends on now live apart. Chosen because the file was the single
point every realtime change had to pass through, which costs merge conflicts as soon as more than one
person works on realtime, and because the repo's own `RULE.md` asks for business rules in services
rather than in handlers. The alternative — splitting only the handlers and leaving Prisma access in
the gateways — would have kept the layering violation that made the file grow.

**Re-exporting the contract from `api.ts` instead of updating ~120 import sites.** Keeps this change
reviewable and means a mistake can only be in one file. The cost is one indirection: `./api` is still
where the web imports its types from, so the fact that they are shared is not visible at the call
site.

**Annotating only `formatMessage` against the contract.** Pinning every service would mean rewriting
every formatter's date handling and field list at once, with no test suite to catch a dropped field.
The message path is the highest-churn surface and now serves as the pattern; the rest are listed
below. The cost is that the other surfaces are still only conventionally in sync.

**Migrating 3 hooks to React Query, not all 33.** A partial migration means two patterns coexist for
a while, which is its own cost. Chosen because the message and DM hooks are entangled with optimistic
socket updates, where a mistake is a lost or duplicated message, and because keeping each migrated
hook's public API identical makes each step verifiable on its own. Migrating everything in one pass
would have been unverifiable without a test suite.

**Removing Redis from compose rather than adopting it.** Adopting it (socket.io adapter plus a shared
rate-limit store) is the real fix for single-instance state, but it is a design decision about how
this deploys, not a cleanup. Removing the service makes the current constraint honest instead of
implying a dependency that does not exist.

## Risks and rollback

- The gateway split is the largest behavioral risk. It is covered by an end-to-end socket check and
  the repo's UI smoke test, but not by unit tests. Rollback: the whole change is on
  `refactor/convention-and-scale`; the gateway files can be reverted independently of the rest.
- `formatMessage` listing fields explicitly means a field added to the Prisma query in future no
  longer reaches the client implicitly — it must be added to the contract. This is the intent, but it
  will surprise anyone used to the spread.
- `env_file: - .env` in compose requires `JWT_SECRET` to be present in the repo-root `.env`. This was
  not verified, because reading `.env` is denied by the agent permission rules.
- The stale-presence reset on boot assumes a single API instance. With two instances, each restart
  would mark the other's connected users offline until their next event.

## Test plan

No automated tests: `RULE.md` forbids adding test files to this repository.

Verified:

- `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, `check:file-size`,
  `docs:check`, `i18n:check`, `ui:scan` — all pass.
- API boots against local Postgres; all 21 socket handlers register across `MessagesGateway` and
  `VoiceGateway`; `/health` returns 200 with `database: ok`.
- A throwaway socket script logged in as the seeded `demo` user, opened two sockets, and ran
  `unread:get`, `channel:join`, `message:create`, `typing:start` and `voice:leave` successfully.
  Closing one of the two sockets left the user `ONLINE`; closing the last one set `OFFLINE`.
- `GET /channels/:id/messages` was captured before and after the `formatMessage` change: the sorted
  key sets of the message, author, attachment, reaction and thread objects are identical, and only
  JSON key order differs.
- `npm run ui:smoke` returns `ok: true` — login, channel creation, sending a message with an
  attachment, link preview, reaction and reply all work against the rebuilt API and web bundle.

Not verified:

- Chunked upload limits were not exercised end to end; only the single-file upload path ran, through
  the smoke test.
- Voice and WebRTC signaling beyond `voice:leave` — a real peer connection was not established.
- DM ringing (`dm:call:*`).

Manual scenario for the upload limits, for whoever picks this up: post to `/uploads/chunks` with
`totalChunks` above `ceil(UPLOAD_MAX_BYTES / UPLOAD_CHUNK_BYTES) + 1` and expect 400 "Too many upload
chunks"; then send chunks whose combined size exceeds `UPLOAD_MAX_BYTES` while declaring a small
`fileSize`, and expect 400 "File is too large" at assembly.

## Deployment notes

- `JWT_SECRET` must be set in the environment for `docker compose up`; it is no longer in the compose
  file. Add it to the root `.env`.
- The Redis container is gone. Nothing read it, but any external tooling that assumed
  `discord-clone-redis` exists needs updating.
- Build order changed: `packages/shared` must build before the apps. `npm run build` and
  `npm run typecheck` handle this; any custom pipeline that calls the workspace scripts directly
  needs the same ordering.
- No migration, no new environment variable, no breaking API change.

## Remaining work

Surfaces still to annotate against `packages/shared/src/api-contract.ts`, in rough order of churn:
messages (done), direct messages, servers and channels, friends, notifications, events and emoji.

Web hooks still on `useState`: 30 of 33, notably `useChatOrchestrator`, `useDirectMessages`,
`useMessageHistory`, `useHomeWorkspace` and `useSettingsActions`. `AppShell.tsx` is 800 lines and
still the orchestrator; splitting it should follow the hook migration, not precede it.
