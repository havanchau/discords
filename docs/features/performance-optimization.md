# Feature Spec: Performance Optimization Pass

This specification covers a focused optimization pass on the hottest read paths of the API (server list, server detail, realtime unread fan-out, DM list), the web production bundle, and message list re-renders.

## Goal

Remove per-channel / per-member query loops (N+1) on paths that run on every page load or every message, shrink the web bundle, and stop the message list from re-rendering on unrelated state changes — without changing any visible behavior or permission outcome.

Acceptance criteria:

- `GET /servers`, `GET /servers/:id`, the `unread:get` socket event, the `message:create` unread fan-out, and `GET /direct-messages/conversations` run a constant number of queries, independent of channel / member / conversation count.
- Channel visibility results are identical to the current `PermissionsService.hasChannelPermission` for every combination of owner, roles, private channel, role override, and member override.
- Unread counts are identical to the current per-channel `count` queries.
- The web production build no longer ships the React development build, and `zod` is no longer in the web bundle.
- Typing events from other users no longer re-render every `MessageRow`.

## Scope

- **In Scope**:
  1. Batched channel permission evaluation for server list, server detail, realtime unread fan-out, and realtime unread counts.
  2. Batched unread counts for server channels and DM conversations.
  3. Removal of `email` from other users' profiles in friends and DM payloads.
  4. `@@index([receiverId])` on `FriendRequest`.
  5. Web bundle: production React build, drop `zod` from the web bundle, lazy-load settings panels.
  6. Memoized `MessageRow` with stable props from `AppShell`.
  7. `.dockerignore` excluding nested `.env` files.
  8. Upload streaming: single-file uploads go to a temp file on disk instead of RAM, and chunk assembly streams instead of reading chunks with sync I/O.
  9. Message list virtualization for channel messages.
- **Out of Scope**:
  - Chunk requests (`POST /uploads/chunks`) keep `memoryStorage()`: each chunk is capped at `UPLOAD_CHUNK_BYTES` (2 MB default), so buffering one chunk is cheaper than a temp file round-trip.
  - Virtualizing the DM timeline (`components/home/DirectMessageTimeline.tsx`), thread panel, and utility panel lists.
  - Changing when the channel list scrolls (today it does not auto-scroll to the newest message; virtualization keeps that).
  - Caching permissions in Redis (needs an invalidation design for role / override changes).
  - Refactoring the other `hasChannelPermission` callers (single-channel checks on write paths are already O(1)).

## Current Behavior

### API

- `ServersService.listForUser` (`apps/api/src/modules/servers/servers.service.ts:78-101`) loads servers with channels, then sequentially `await`s `hasChannelPermission` for every channel of every server.
- `ServersService.getServerForUser` (`servers.service.ts:103-151`) loads channels and members with roles, then per channel calls `hasChannelPermission` and a `message.count` for the unread count.
- `PermissionsService.hasChannelPermission` (`apps/api/src/modules/permissions/permissions.service.ts:74-107`) runs 2–4 queries per call: `channel.findUnique`, `serverMember.findUnique` with roles, `hasServerPermission` (re-queries the member) for private channels, and `channelPermissionOverride.findMany`.
- `RealtimeGateway.emitUnreadUpdated` (`apps/api/src/modules/realtime/realtime.gateway.ts:529-556`) runs on every `message:create` and is awaited before the ack (`realtime.gateway.ts:137`). It loads all server members, then calls `hasChannelPermission` per member.
- `RealtimeGateway.countUnreadByChannel` (`realtime.gateway.ts:558-595`, event `unread:get`) calls `hasChannelPermission` and `message.count` per text channel across all of the user's servers.
- `DirectMessagesService.listConversations` (`apps/api/src/modules/direct-messages/direct-messages.service.ts:15-30`) runs `directReadState.findUnique` + `directMessage.count` per conversation.
- `FriendsService.userSelect` (`apps/api/src/modules/friends/friends.service.ts:203-213`) and `DirectMessagesService.conversationInclude` (`direct-messages.service.ts:196-221`) return `email` of other users. The web app only reads the signed-in user's own email (`apps/web/src/components/settings/ProfileSettings.tsx:112`).
- `FriendRequest` (`apps/api/prisma/schema.prisma:368-379`) only has `@@unique([requesterId, receiverId])`; queries filter `OR: [{ requesterId }, { receiverId }]`.

### Web

- `npm run build --workspace apps/web` produces one 892 kB chunk (gzip 252 kB). A sourcemap breakdown shows `react-dom/cjs/react-dom-client.development.js` in the bundle. Building with `envDir` pointed at an empty folder produces 623 kB, so a local env file under `apps/web` is switching Vite out of production `NODE_ENV`. The root `.dockerignore` lists `.env` / `.env.*`, which only match the repository root, so `COPY . .` in `apps/web/Dockerfile` and `apps/api/Dockerfile` also copies `apps/*/.env` into the build stage. For the web image this means the same development React build can ship; for the API image the file stays in the build stage only (the runner stage copies `dist` and `prisma`), but it still lands in the local build cache.
- `apps/web/src/hooks/useRealtimeSocket.ts:3` imports `RealtimeEvents` from `@discord-clone/shared`, whose `index.ts` re-exports `schemas.ts`. The top-level `z.object(...)` calls are treated as side effects, so `zod` (~265 kB of source) is bundled.
- `UploadsController.upload` (`apps/api/src/modules/uploads/uploads.controller.ts:24-73`) uses `memoryStorage()`, so a whole file (up to `UPLOAD_MAX_BYTES`) is held in RAM; `UploadsService.uploadToLocal` writes it with `writeFileSync` and `uploadToCloudinary` streams the buffer. `uploadChunk` (`uploads.service.ts:108-196`) writes chunks with `writeFileSync` and assembles them with `readFileSync` + `appendFileSync`, blocking the event loop for the whole assembly.
- `SettingsModal` (`apps/web/src/components/SettingsModal.tsx`) statically imports all five settings panels.
- `MessageList` (`apps/web/src/components/chat/MessageList.tsx`) renders every visible message as DOM. Jump-to-message (`ChatPanel.tsx:56-65`, used by search / pinned results) and reply-preview jump (`MessageRow.tsx:92-96`) use `document.querySelector('[data-message-id]')`, which only works for rows present in the DOM. "Load older messages" prepends rows and relies on browser scroll anchoring.
- `ChatPanel` (`apps/web/src/components/ChatPanel.tsx:141-151`) maps `messages.visible` to `MessageRow`, which is not memoized. `AppShell` (`apps/web/src/AppShell.tsx:587-781`) builds the `messageActions` object, `toggleReaction` arrow, and `pinnedIds` (`?? []`) as new values on every render, and every socket `typing:*` event updates `typingUsers` in `AppShell`.

## Changes

### 1. Batched channel permission evaluation (API)

- New pure function `evaluateChannelPermission({ member, channel, overrides, permission })` reproducing `hasChannelPermission` exactly:
  - no member → `false`; `OWNER` → `true`;
  - `ViewChannel` on a private channel → `true` if any role has `MANAGE_CHANNELS`, else start from `false`;
  - otherwise start from "any role has the permission";
  - apply role overrides (deny then allow, oldest override first), then the member override (deny then allow).
- Overrides are now loaded ordered by `createdAt`. Before, the order was unspecified, so a member with two roles whose overrides conflict on the same channel could resolve either way; now the newest role override wins consistently.
- `hasChannelPermission` keeps its signature and becomes "load channel, member, overrides → `evaluateChannelPermission`" (drops the duplicate member query in `hasServerPermission`). All existing callers keep working.
- New `PermissionsService.filterViewableChannels(userId, channels)`:
  - one `serverMember.findMany({ where: { userId, serverId: { in } }, include roles })`;
  - one `channelPermissionOverride.findMany({ where: { channelId: { in } } })`;
  - evaluates each channel in memory.
- New `PermissionsService.filterMembersWhoCanView(channel, members)` for the fan-out: one overrides query for the channel; members are loaded with roles by the caller.
- Callers switched: `listForUser`, `getServerForUser`, `emitUnreadUpdated`, `countUnreadByChannel`.

### 2. Batched unread counts (API)

- New `countChannelUnread(userId, channelIds)` returning `Record<channelId, number>` in one parameterized `$queryRaw`:
  `Message` left-joined to the user's `ReadState` per channel, `deletedAt IS NULL`, `authorId <> userId`, `createdAt > lastReadAt` when a read state exists, grouped by `channelId`. Same filter as today's per-channel `count` (thread replies stay counted, as now).
- New `countDirectUnread(userId, conversationIds)` with the same shape over `DirectMessage` / `DirectReadState` (no `deletedAt` filter, matching today).
- Channels with no unread messages get `0` in `getServerForUser` (same as today) and are omitted in `countUnreadByChannel` (same as today).
- `emitUnreadUpdated` stays awaited so the socket ack ordering does not change; it just becomes cheap.

### 3. Hide other users' email (API contract change)

- `userSelect` in friends and the member `user` select in DM `conversationInclude` drop `email`. Lookup by email in `FriendsService.request` keeps working (the `where` still matches on email; only the response omits it).
- Web: friend / DM user types get a `PublicUser = Omit<User, 'email'>` shape so the compiler catches any reader.

### 4. Index

- `FriendRequest`: add `@@index([receiverId])` via a new migration `apps/api/prisma/migrations/<timestamp>_friend_request_receiver_index/migration.sql`.

### 5. Web bundle

- `.dockerignore`: add `**/.env` and `**/.env.*` (keep `!**/.env.example` consistent with `.gitignore`).
- `apps/web/package.json` `build` script runs Vite with `NODE_ENV=production` forced, so a developer env file can no longer produce a development React build.
- `packages/shared/package.json`: add `"sideEffects": false` so unused schemas (and `zod`) are tree-shaken from the web. Verified by rebuilding and checking the sourcemap: no `zod` sources remain.
- `SettingsModal`: the five panels load with `React.lazy`, rendered inside a `Suspense` with a small loading state in the dialog body. The dialog shell stays eager so open / close animation is unchanged.

### 6. Message list re-renders (web)

- `MessageRow` wrapped in `React.memo`.
- `AppShell`: `messageActions` built with `useMemo`; `saveMessageEdit`, `deleteMessage`, `toggleReaction` wrapped in `useCallback`, reading the current message list through a ref (same pattern as the existing `channelKeysRef`) so they do not change on every new message; `pinnedIds` uses a module-level empty array constant.
- Accepted limitation: while a message is being edited, `editingDraft` changes on each keystroke and rows re-render as today.

### 7. Upload streaming (API)

- `POST /uploads` uses multer `diskStorage` into `UPLOAD_TMP_DIR` (default `uploads/.chunks`) with a random server-side file name (the client name is never used as a path). Same field name, limits, extension filter, and response shape.
- `UploadsService.upload` takes the temp file path and reuses the existing `uploadFromPath` (local: move into `STORAGE_LOCAL_DIR`; Cloudinary: `upload_large` from the file). The buffer-based `uploadToLocal` / `uploadToCloudinary` are removed.
- The temp file is deleted on every failure path (size, MIME validation, storage error).
- Moving the file falls back to copy + delete when `rename` fails with `EXDEV` (temp dir on a different filesystem).
- `uploadChunk` writes the chunk with `fs/promises`, and assembles by reading each `.part` and writing it to one open file handle, so at most one chunk (≤ `UPLOAD_CHUNK_BYTES`) is in memory and the event loop is not blocked. The chunk directory is removed on failure as well as success.
- Validation rules, limits, and error messages are unchanged.

### 8. Message list virtualization (web)

- `MessageList` renders rows through `@tanstack/react-virtual` `useVirtualizer` with dynamic measurement (`measureElement`), keyed by message id, `overscan` of 8 rows. The channel intro and "Load older messages" button stay as normal DOM above the virtual area (`scrollMargin`).
- `MessageList` takes `renderMessage(message, index)` instead of pre-rendered `children`, and exposes `scrollToMessage(messageId)` through a ref.
- Jump-to-message (search, pinned, reply preview): scroll the virtualizer to the row index (`align: 'center'`), wait up to 10 animation frames for the row to mount, then `scrollIntoView` (smooth, centered), focus and highlight it. The reply preview used to only smooth-scroll; it now also focuses and highlights, like the other jumps. Messages not in the current visible list stay a no-op, as today. `MessageRow` gets an `onJumpToMessage` prop instead of querying the document.
- Load older messages: the virtualizer's `anchorTo: 'end'` keeps the row at the top of the viewport in place when rows are prepended (it re-resolves the anchor row by key), and native `overflow-anchor` is disabled on the list so the browser does not correct twice. `followOnAppend` stays off, so new messages still do not auto-scroll.
- Loading, empty, "no search match", and intro states are unchanged.

## Technical Approach

- **Modules & Files**:
  - `apps/api/src/modules/permissions/channel-permission.ts` (new, pure evaluator)
  - `apps/api/src/modules/permissions/permissions.service.ts`
  - `apps/api/src/modules/servers/servers.service.ts`
  - `apps/api/src/modules/realtime/realtime.gateway.ts`
  - `apps/api/src/modules/direct-messages/direct-messages.service.ts`
  - `apps/api/src/modules/friends/friends.service.ts`
  - `apps/api/prisma/schema.prisma` + new migration
  - `apps/api/tsconfig.build.json` (new)
  - `apps/api/src/modules/messages/unread-counts.ts` (new)
  - `apps/web/src/AppShell.tsx`, `components/chat/MessageRow.tsx`, `components/SettingsModal.tsx` (+ `.module.css`), `api.ts`, `components/home/DirectMessageTimeline.tsx`
  - `apps/web/src/hooks/useChannelEncryption.ts`: `decryptMessageForDisplay` / `decryptMessagesForDisplay` wrapped in `useCallback` (they only read keys through `channelKeysRef`), so the message actions and thread callbacks built on them keep a stable identity
  - `apps/web/package.json`, `packages/shared/package.json`, `.dockerignore`
  - `apps/api/src/modules/uploads/uploads.controller.ts`, `uploads.service.ts`
  - `apps/web/src/components/chat/MessageList.tsx`, `MessageList.module.css`, `components/ChatPanel.tsx`
- **API Contracts**: response shapes unchanged except `email` removed from other users in `GET /friends` and friend-request / DM conversation payloads. No endpoint or status code changes.
- **DB**: one additive index on `FriendRequest(receiverId)`. No data changes.
- **Libraries**: `@tanstack/react-virtual` (web) — headless, supports variable row heights measured at runtime, ~10 kB, React 19 compatible.

## Trade-offs

- **In-memory permission evaluation vs Redis cache**:
  - _Chosen_: batch-load members / roles / overrides per request and evaluate in memory.
  - _Rationale_: removes the N+1 with no staleness — every request still reads current roles and overrides.
  - _Cost_: permission rules now live in one pure function that all paths must use; mitigated by routing `hasChannelPermission` through the same function.
  - _Rejected_: Redis cache — needs invalidation on role, member-role, and override writes; too much risk for this pass.
- **Raw SQL for unread counts vs Prisma**:
  - _Chosen_: one parameterized `$queryRaw` per call.
  - _Rationale_: the "messages after this user's per-channel `lastReadAt`" condition differs per channel, which Prisma `groupBy` cannot express in one query.
  - _Rejected_: `Promise.all` of per-channel `count` — still N queries and N pool connections.
  - _Cost_: raw SQL is not type-checked against the schema; covered by the manual comparison in the test plan.
- **`sideEffects: false` vs subpath exports**: `sideEffects` is a one-line change and keeps the single `@discord-clone/shared` entry point; subpath `exports` would change resolution for every consumer.
- **Forcing `NODE_ENV=production` in the build script vs asking developers to fix their env file**: the script fix protects every environment (local, Docker, CI) regardless of local files.
- **Memoization and virtualization together**: memoization cuts re-render work for rows in the DOM; virtualization caps how many rows are in the DOM. Virtualization alone would still re-render every mounted row on each typing event.
- **`@tanstack/react-virtual` vs `react-window` vs hand-written windowing**:
  - _Chosen_: `@tanstack/react-virtual`.
  - _Rationale_: chat rows have variable height (grouping, date dividers, attachments, reactions, edits); it measures rows after render without a fixed-size API.
  - _Rejected_: `react-window` needs known or cached sizes up front; a hand-written window would re-implement measurement and scroll correction.
  - _Cost_: new dependency; rows not in the DOM cannot be found by `querySelector` or browser find-in-page (Ctrl+F) — the in-app search covers the first case.
- **Disk temp file vs streaming straight to storage**: multer must finish receiving the multipart body before validation in the controller runs; a temp file keeps the existing validation order and is one code path for both storage drivers.

## Risks & Rollback

- **Permission regression** (a user sees a private channel or loses a visible one): highest-impact risk. Mitigated by the evaluator mirroring every branch of the current code, and by keeping `hasChannelPermission` on the same evaluator.
- **Unread count drift**: raw SQL filter mismatching the old `count`. Mitigated by manual comparison on seeded data.
- **Email removal**: any external client relying on peer `email` breaks. The web app does not read it.
- **Memoized rows showing stale data**: if a prop becomes stable while its content changes. Mitigated by keeping `message` objects immutable (all updates already `map` to new objects).
- **Virtualized scroll glitches**: row height estimates cause small jumps while scrolling up through unmeasured rows, and jump-to-message into a far unmeasured range may need a second correction. Mitigated by measuring every rendered row and scrolling again after the target renders.
- **Upload temp files left behind**: a crash mid-request can leave a file in `UPLOAD_TMP_DIR`; same risk as today's chunk directories.
- **Rollback**: all changes are code-only except the additive index, which can stay in place or be dropped with `DROP INDEX "FriendRequest_receiverId_idx"`. Revert the commit to roll back.

## Test Plan

- **Checks**:
  - Repo checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:file-size`, `npm run docs:check`.
- **Manual Verification** (requires the local Postgres from `docker compose up -d postgres redis` and `npm run db:seed`):
  - Log in as the demo user, open the server list and a server: same channels visible as before, unread badges match.
  - As a second user without access, confirm a private channel stays hidden; add a role override and confirm it appears.
  - Send messages from user A; user B receives `unread:updated` with correct mention count.
  - Open the DM list: unread counts match the previous build.
  - Upload an image and a PDF (single request) and a file larger than `UPLOAD_CHUNK_BYTES` (chunked), with `STORAGE_DRIVER=local`: attachments render; `UPLOAD_TMP_DIR` is empty afterwards. Upload a `.exe` renamed file: rejected, no temp file left.
  - In a channel with several hundred messages: scroll through, click "Load older messages" (position kept), jump from search, pinned, and reply preview to an off-screen message (row centered and highlighted).
  - Build the web app and confirm the chunk size dropped and the sourcemap no longer contains `react-dom-client.development.js` or `zod`.

## Deployment Notes

- Run the new migration (`prisma migrate deploy`) before or with the API deploy; it only adds an index on a small table.
- Rebuild Docker images so `.env` files are excluded from the build context and the web image gets the production React build.
- Frontend and API can ship independently; the `email` removal only affects third-party clients.
