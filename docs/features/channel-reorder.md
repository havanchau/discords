# Channel Reorder

- **Status**: draft — awaiting review
- **Date**: 2026-09-29
- **Related**: [`channel-categories.md`](channel-categories.md), [`channel-live-settings-sync.md`](channel-live-settings-sync.md)

## Goal

Today the only way to change a channel's or a category's place in the sidebar is typing a raw
integer into a "Position" field: `ChannelSettings.tsx:126-130` renders `defaultValue={channel.position ?? 0}`
in a numeric input, and `EditCategoryDialog.tsx:69-73` does the same for a category, each saved with a
single `PATCH` (`useSettingsActions.ts:502,515` for channels; `useWorkspaceNavigation.ts:237-265`
`updateCategory` for categories). `channel-categories.md`'s own scope explicitly deferred this:
"drag-and-drop reordering… position editing is already exposed through settings… and can follow the
same way" (`docs/features/channel-categories.md:20,89`). There is no drag-and-drop anywhere in the web
client (`grep -rn "draggable\|onDragStart" apps/web/src` — no matches) and no bulk-reorder endpoint —
only `PATCH /channels/:channelId` and `PATCH /categories/:categoryId`, one row at a time
(`apps/api/src/modules/channels/channels.controller.ts:34-41`,
`apps/api/src/modules/channels/categories.controller.ts:25-32`). This doc designs drag-and-drop
(with a keyboard-operable fallback) for both channels and categories, backed by one atomic
bulk-reorder call per drop, replacing the raw-number-in-a-form workflow.

**Acceptance criteria**:

- [ ] A member with `MANAGE_CHANNELS` can drag a channel to a new position within its category, into
      a different category, or drag a category itself to reorder the category list, and the change
      persists in one request.
- [ ] The same reorder is available from the keyboard: a channel/category row can be picked up and
      moved with keys alone, with the current move state announced to assistive tech.
- [ ] Two moderators dragging at the same time never leave the channel list with two channels
      sharing one displayed position, and neither moderator's change is silently dropped without
      either a persisted result or a visible error.
- [ ] Every other open client (a second tab, a second member) sees the new order without reloading,
      the same way `channel:updated` already delivers other settings changes live
      (`channel-live-settings-sync.md`).
- [ ] The raw "Position" number field is removed from `ChannelSettings.tsx` and `EditCategoryDialog.tsx`
      once drag-and-drop covers the same capability.
- [ ] `npm run i18n:check` passes — every new sidebar/announcement string is an `en`/`vi` key.

## Scope

**In scope**

- One bulk-reorder endpoint each for channels and categories (see Technical approach) — a single
  request carries the server's full new channel order (with `categoryId` moves included) and the
  full new category order.
- Drag-and-drop in the sidebar (`ChannelSidebar.tsx`, `ChannelList.tsx`'s `CategorySection`/
  `ChannelGroup`/`ChannelRow`) for both channels and categories, plus a keyboard-operable move mode.
- Removing the "Position" field from `ChannelSettings.tsx` and `EditCategoryDialog.tsx`.
- The realtime event that tells other open clients a reorder happened.
- Optimistic UI update with rollback if the request fails.

**Out of scope**

- Category-level permission overrides — unaffected by reorder (`channel-categories.md`'s own
  out-of-scope list already excludes this).
- Any change to `filterViewableChannels` or channel/category visibility rules — reorder does not
  change who can see what, only display order.
- Mobile/touch drag polish beyond "does not break at 390×844" — full touch-drag UX (long-press
  affordance, haptics) is a separate pass; see Changes → Web for the minimum bar.
- Voice channel member list ordering, forum tag ordering (`forum-tags.service.ts` already owns its
  own reorder via full-set `PUT`) — untouched by this doc.

## Current behavior

- `Channel.position Int @default(0)` (`apps/api/prisma/models/channels.prisma:31`) and
  `ChannelCategory.position Int @default(0)` (`apps/api/prisma/models/channels.prisma:14`) — both
  plain integers with no `@@unique` constraint on `(serverId, position)`. `ChannelCategory` has an
  index `@@index([serverId, position])` (`channels.prisma:20`); `Channel` has no position index, only
  `@@unique([serverId, name])` and `@@index([categoryId])` (`channels.prisma:60-61`).
- **Nothing keeps positions unique or contiguous today.** `createChannel` sets
  `position: channelCount` — a plain `count()` at request time
  (`apps/api/src/modules/channels/channels.service.ts:29,41`); `createCategory` does the same
  (`categories.service.ts:18,20`). Two concurrent creates can both read the same count and both write
  the same position — nothing in either service re-reads or checks before the write. `updateChannel`
  writes `dto.position` verbatim with no bounds or uniqueness check
  (`channels.service.ts:99`), and `updateCategory` does the same (`categories.service.ts:40`).
  Duplicate or gapped positions are a pre-existing, unenforced possibility; this doc does not need to
  fix that pre-existing gap to ship reorder, but the new bulk write must not make it worse (see
  Changes → Position scheme).
- `listChannels` orders by `[{ position: 'asc' }, { createdAt: 'asc' }]`
  (`channels.service.ts:56`) — the tie-breaker on equal positions is creation time, not request order.
- `groupChannelsByCategory` (`apps/web/src/utils/channelCategories.ts:19-45`) sorts categories by
  `position` (`:22`) and places each channel under its category preserving the channels array's
  existing order (`:27-34`) — it does not itself sort channels by position; it trusts the order
  `listChannels` already returned.
- The web reorder UI today is exactly two number inputs: `ChannelSettings.tsx:126-130`
  (`name="position"`, `defaultValue={channel.position ?? 0}`) saved through
  `useSettingsActions.ts:502,515` (`positionValue ? Number(positionValue) : undefined`), and
  `EditCategoryDialog.tsx:69-73`/`:31-35` (an emptied field keeps the current position instead of
  becoming 0) saved through `useWorkspaceNavigation.ts:237-265` `updateCategory`, which calls
  `PATCH /categories/:categoryId` with `{ name, position }` and patches its own client's
  `serverDetail` cache on success (`:243-253`).
- `channel:updated` already exists and already refetches `serverDetail` on any channel field change,
  including `position` (`channels.service.ts:99,105-124`; web listener
  `useServerModeration.ts:161-165`, `handleChannelUpdated` invalidates
  `queryKeys.serverDetail(payload.serverId)`; wired via `AppShell.tsx:265` per
  `channel-live-settings-sync.md`). There is **no equivalent event for `ChannelCategory` updates** —
  `categories.service.ts` never imports `RealtimePublisher`/`RealtimeEvents` (confirmed by reading the
  whole file) — so a category rename or position change from `updateCategory` today only reaches the
  acting client's own optimistic patch; other open clients stay stale until their next
  `serverDetail` refetch. This doc's new events replace the reorder path entirely, so this pre-existing
  category gap does not need a separate fix here, but is worth naming (see Risks).
- No test suite: `package.json` scripts are `dev`, `build`, `lint`, `typecheck`, `format`,
  `i18n:check`, `ui:scan`, `ui:smoke`, `docs:check`, `db:*` — no `test` script at the root or in
  `apps/api`/`apps/web`.

## Changes

### API: one bulk endpoint per collection

Two new endpoints, each replacing the *entire* ordered list for the server in one request:

- `PUT /servers/:serverId/channels/order`
- `PUT /servers/:serverId/categories/order`

**Why bulk, not N `PATCH` calls (the `failure-and-state.md` argument):** a drag-and-drop reorder is
a single user gesture that touches every row between the old and new position — moving channel A from
slot 2 to slot 5 shifts B, C, D, E each by one. Doing that as N sequential `PATCH /channels/:channelId`
calls means:
1. **Not atomic.** A crash, a network drop, or the tab closing after request 3 of 6 leaves the sidebar
   in a state nobody chose — some channels moved, some not, matching neither the old nor the new
   order.
2. **Racy under two moderators.** If moderator X drags channel A to slot 2 while moderator Y
   simultaneously drags channel B to slot 4, both issue their own sequence of per-channel `PATCH`es;
   each write only knows the position it's setting, not what else changed concurrently — the two
   sequences interleave at the database and the final order is neither X's nor Y's intended layout,
   silently corrupted with no error to either moderator (exactly "read-modify-write is racy,
   transaction or not" from `~/.claude/rules/failure-and-state.md`).
3. **No natural place to validate the whole set** — "every id belongs to this server, no duplicates,
   category ids valid" is a set-level invariant; checking it once at the start of a single request is
   direct, checking it per-`PATCH` cannot see the other rows in the same drag.

A single request carries the client's full intended order; the server validates the whole set once,
then writes it in one transaction (`prisma.$transaction`, the same primitive
`updatePermissionOverrides` already uses for a delete-then-recreate set replace,
`channels.service.ts:161-175`). A conflicting concurrent reorder is resolved by "last write commits",
made visible to both moderators immediately afterward through the realtime event below — not silently
merged.

**Request/response contract**

`PUT /servers/:serverId/channels/order`
- Body: `{ channels: Array<{ id: string; categoryId: string | null; position: number }> }`
- Validation (`ReorderChannelsDto`, new file `apps/api/src/modules/channels/dto/reorder-channels.dto.ts`):
  - `channels`: non-empty array, each entry validated with `class-validator`'s `@ValidateNested`.
  - Every `id` must be a channel that belongs to `:serverId` — checked once against
    `prisma.channel.findMany({ where: { serverId }, select: { id: true } })`, same shape as the
    existing `requireCategoryInServer` single-row check (`channels.service.ts:226-232`), extended to
    a set membership check.
  - No duplicate `id`s in the payload (`400 Duplicate channel id in reorder payload`).
  - **The payload must include every channel of the server, not a partial list** — a partial payload
    cannot express "channel not in this payload keeps its old position" without re-adding sparse-vs-dense
    ambiguity; requiring the full set makes the endpoint's effect unambiguous. Missing or extra ids →
    `400 Reorder payload must include exactly the server's current channels`.
  - Every non-null `categoryId` must be a category of the same server (reuses
    `requireCategoryInServer`, `channels.service.ts:226-232`).
  - `position` is not separately validated for contiguity by the client payload — the server
    **recomputes** dense positions server-side from array order per category (see Position scheme),
    so a client sending gapped or duplicate `position` values cannot corrupt storage; the field is
    accepted for forward-compatibility with a future partial-payload version but the source of truth
    for the write is each channel's index within its category in the submitted array order.
  - Permission: `Permission.ManageChannels` on `:serverId`, the same permission `updateChannel` and
    the categories endpoints already require (`channels.service.ts:82-86`; confirmed against
    `packages/shared/src/permissions.ts:5`, `ManageChannels: 'MANAGE_CHANNELS'` — no other permission
    name exists for channel structure changes).
- Response `200`: `{ channels: Channel[] }` (the full server channel list, new order, same shape
  `listChannels` returns).
- Errors: `400` validation (see above) · `403` missing `ManageChannels` · `404` server not found /
  caller not a member (mirrors `requireServerPermission`'s existing behavior, `permissions.service.ts:33`
  — not re-verified line-by-line beyond the signature, since it is unchanged by this doc).

`PUT /servers/:serverId/categories/order`
- Body: `{ categories: Array<{ id: string }> }` (order in the array *is* the order; no per-item
  `position` field needed since categories have no parent to move between).
- Validation: every `id` belongs to `:serverId`, no duplicates, payload is exactly the server's
  current category set (same "full set" rule as channels, same reasoning).
- Permission: `ManageChannels`.
- Response `200`: `{ categories: ChannelCategory[] }`.
- Errors: `400` / `403` / `404`, same shape as above.

Both live on their existing controllers: `ChannelsController` gets the channel-order route,
`CategoriesController` gets the category-order route — same controller, same guard
(`JwtAuthGuard`), no new module.

### Position scheme

**Chosen: dense integers, fully rewritten server-side on every reorder, one transaction.**

The server ignores the client's raw `position` numbers as the write source and instead assigns
`0..n-1` per category (channels) or `0..n-1` for the whole server (categories) from the *array order*
the client submitted — `channels.filter(c => c.categoryId === categoryId)` in submitted order gets
positions `0, 1, 2, …` within that category, repeated per category including `null` (uncategorized).
This is a straightforward extension of what `createChannel`/`createCategory` already do (`count()` as
the next position) — it keeps the same "dense, 0-based, contiguous" invariant the rest of the codebase
already assumes (`listChannels`'s `orderBy` and `groupChannelsByCategory`'s sort both implicitly rely
on positions being meaningful integers, not on any particular gap).

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): dense integers, full rewrite per reorder, one transaction** | Matches the existing scheme exactly (`count()`-based positions today) — no migration, no dual-write period; simple to reason about and to debug (`SELECT ... ORDER BY position` always shows the true order); the "full set required" API design means the rewrite touches only rows already being sent, so a moderator moving one channel among 50 costs one `updateMany`-shaped write per category, not 50 individual round trips from the client. | A server-side write touches every row whose category changed rank — for a large single category (hundreds of channels) that's an `UPDATE` per row inside the transaction; still one DB round trip via `Promise.all` of `prisma.channel.update` calls inside `$transaction`, but O(n) writes, not O(1). | Chosen — this repo already has zero infrastructure for fractional keys (no `Decimal` position column, no rebalance job) and channel/category counts per server are small (dozens, not thousands) per the existing UI's assumption of a single scrollable sidebar list; O(n) integer writes on an infrequent, moderator-only action is a non-issue at this scale. |
| B: fractional/sparse positions (e.g. average of the two neighbors, `Float`/`Decimal`) | A single move touches only the moved row — O(1) writes; common pattern in collaborative-ordering systems (Figma-style keys). | Needs a schema change (`Int` → `Decimal`/`Float`) — a live migration on a populated table; needs an explicit rebalance story for when two inserts converge on the same fractional value or float precision runs out after many inserts between the same two neighbors, which is exactly the kind of open-ended "rebalance job" this repo has never needed and would have to build, test, and maintain from scratch; changes the meaning of `position` for every existing reader (`listChannels`'s `orderBy`, `groupChannelsByCategory`'s sort) even though none of them require a float. | Rejected — solves a scale problem (huge lists, extremely frequent reordering) this app does not have, at the cost of a schema migration and a new maintenance burden (rebalancing) with no current requirement driving it. |
| C: keep per-row `PATCH` for position, no bulk endpoint at all | No new endpoint, smallest diff. | Fails the atomicity/concurrency argument above outright — this is the option the Goal section's acceptance criteria (single atomic request, no interleaved corruption) rules out by definition. | Rejected — does not meet the stated acceptance criteria. |

**Cost of the chosen option**: a reorder transaction does O(n) row writes where n is the number of
channels in the affected category (or the whole server for a category reorder) — bounded by this
repo's own UI assumption of a single-server sidebar, so acceptable without a rebalance mechanism. The
existing lack of a uniqueness constraint on `(serverId, position)`/`(categoryId, position)` stays
unenforced at the DB level (see Risks) — the server-side rewrite is what keeps positions dense and
non-colliding in practice, not a schema constraint.

### Moving a channel between categories, and moving a category itself

- **Channel across categories**: the single `PUT /servers/:serverId/channels/order` payload already
  carries each channel's *new* `categoryId` alongside its position, so "drag from Category A into
  Category B, third slot" is one payload entry with the new `categoryId` and index — no separate
  "move" endpoint. The existing `requireCategoryInServer` check applies to every non-null
  `categoryId` in the payload, same as single-channel `updateChannel` does today.
- **Category reorder**: `PUT /servers/:serverId/categories/order` is independent of channel order —
  reordering categories never touches any `Channel` row. Both interactions can happen from the same
  drag session in the UI (see Web) but are always sent as two separate requests when both changed,
  since they are two different resources with two different endpoints — never combined into one
  request, keeping each transaction's blast radius to one table.
- **Uncategorized channels** (`categoryId: null`) are included in the channels payload like any other
  channel; there is no "uncategorized category" row to reorder — matches
  `groupChannelsByCategory`'s existing `uncategorizedText`/`uncategorizedVoice` split
  (`channelCategories.ts:28-35`), which stays untouched by this doc except that its input array is now
  also reorderable by drag.

### Realtime

- New events in `packages/shared/src/realtime-events.ts` (alongside `ChannelUpdated: 'channel:updated'`
  at `:51`): `ChannelsReordered: 'channels:reordered'` and `CategoriesReordered: 'categories:reordered'`,
  each documented the same way as the existing entries — `/** { serverId } after a bulk channel/category
  reorder; clients refetch the server detail. */`.
- Both new endpoints emit their event to `serverRoom(serverId)` with payload `{ serverId }` only —
  same "id-only, client refetches" shape `channel:updated` already established and the same reasoning
  from `channel-live-settings-sync.md`'s Trade-offs (Option B there: broadcasting field values to a
  server-wide room would leak private-channel data to non-viewers; a bulk reorder payload has the same
  problem one level worse, since it would need to reveal the *entire* channel list including private
  ones to every socket in the room).
- Web: `useServerModeration.ts` gains `handleChannelsReordered`/`handleCategoriesReordered`, structurally
  identical to the existing `handleChannelUpdated` (`:161-165`) — `invalidateQueries` on
  `queryKeys.serverDetail(payload.serverId)`. No new query key needed; channel and category order both
  live inside `serverDetail`.
- This also closes the pre-existing gap noted in Current behavior: category changes gain realtime sync
  for the first time (today `categories.service.ts` emits nothing at all), scoped strictly to what this
  doc's own reorder endpoint touches — renaming a category via `PATCH /categories/:categoryId` still
  does not broadcast, and stays out of scope here (that gap is `categories.service.ts` never importing
  `RealtimePublisher`, a wider fix than this doc's reorder-only surface).

### Web: drag-and-drop approach

**No drag-and-drop library exists in this monorepo today** — `apps/web/package.json` and the root
`package.json` were grepped for `dnd`/`drag`/`sortable`/`beautiful` and neither lists one.

**Proposed dependency: `@dnd-kit/core` + `@dnd-kit/sortable`** (MIT license, ~10 kB gzipped each for
core/sortable combined per their own published bundle numbers — not independently re-verified in this
session, flagged as inferred). Reason for proposing a library rather than hand-rolled pointer code:
`channel-categories.md` already ruled out hand-rolled pointer code as a trade-off cost ("No drag-and-drop:
needs a new dependency or significant custom pointer code", `channel-categories.md:89`) — reordering a
tree of nested lists (categories containing channels, with cross-category moves) correctly handles
pointer capture, scroll-while-dragging, and touch simultaneously, which is exactly the kind of code this
repo's own `ai-pitfalls.md`/`code-design.md` bias against building from scratch without a second real
need. `@dnd-kit` is chosen over `react-beautiful-dnd` (its most common alternative) because the latter is
in end-of-life mode (its maintainers stopped active development; last major release predates React 18
strict-mode support) — a maintenance risk this doc will not introduce; `@dnd-kit` provides built-in
keyboard sensor support (`KeyboardSensor`), which is required anyway for the acceptance criterion below,
whereas `react-beautiful-dnd`'s keyboard support is more limited. **This dependency choice needs the
user's sign-off before implementation** — it is a new dependency, not something already in
`package.json`, per `~/.claude/rules/typescript.md`.

- **Keyboard path (required, not optional)**: a channel/category row gets a drag handle
  (`IconButton`, matching the existing chevron/edit/create icon buttons already in `CategorySection`,
  `ChannelList.tsx:64-81`) that is itself focusable and operates `@dnd-kit`'s `KeyboardSensor` — Space/
  Enter picks the row up, Arrow Up/Down moves it one slot (or into the adjacent category at a category
  boundary), Space/Enter again drops it, Escape cancels. `@dnd-kit`'s `DragOverlay` and
  `announcements` API surface the current position change to screen readers on each move — mouse-only
  drag-and-drop is an accessibility regression this doc must not ship without this path
  (`~/.claude/rules/frontend-react.md`'s accessibility bar and the task's explicit instruction).
- **Touch / 390×844**: `@dnd-kit`'s `PointerSensor` handles touch by default; the sidebar's existing
  layout at that width is unchanged by this doc (no new columns, same row height) — verify manually
  that a long-press-and-drag on a channel row does not conflict with the existing tap-to-open-channel
  handler (`ChannelRow`'s `onClick`, `ChannelList.tsx:133`) by requiring a drag-handle-initiated drag
  only, never a drag from anywhere on the row, so a tap anywhere else always opens the channel exactly
  as it does today.
- **Optimistic update + rollback**: on drop, the client immediately reorders its local
  `serverDetail` cache via `patchServer` (the same mechanism `updateCategory`/`createCategory` already
  use, `useWorkspaceNavigation.ts:219-223,248-253`) to the new order, then fires the `PUT` request. On
  `200`, nothing further happens beyond confirming the shape (the `channels:reordered`/
  `categories:reordered` event this same client also receives is a no-op re-invalidation of state
  already correct). On failure (network error, `400`, `403`), the client re-fetches `serverDetail`
  from the server to discard the optimistic guess and restore the last-known-good order, and shows an
  error via `message`/`notification` (matching `~/.claude/rules/frontend-react.md`) rather than
  leaving the optimistic (wrong) order on screen.
- **i18n**: new strings — drag-handle `aria-label` (e.g. `channel.action.reorder` /
  `category.action.reorder`), the keyboard-mode announcement text, and any new error/toast copy — are
  added as keys to `apps/web/src/i18n/locales/en/channels.ts` and the matching
  `apps/web/src/i18n/locales/vi/channels.ts`, following the existing `category.field.*`/`channel.field.*`
  naming already in that file (`en/channels.ts:2-35`), so `npm run i18n:check` passes.
- The "Position" number field is deleted from `ChannelSettings.tsx:126-130` and
  `EditCategoryDialog.tsx:69-73`, along with the now-dead `positionValue` parsing in
  `useSettingsActions.ts:502,515` and `EditCategoryDialog.tsx:31-35`, once drag covers the same
  capability — removing a UI path only after its replacement ships, not before, per the acceptance
  criteria ordering.

### Edge cases

| Case | Expected behavior |
|---|---|
| Empty payload / a server with one channel | `channels` array cannot be empty per the DTO's non-empty validation; a single-channel server's reorder request is still valid (array of length 1), a no-op write. |
| Duplicate id in payload | `400 Duplicate channel id in reorder payload`, no write attempted. |
| Payload missing a channel that exists on the server, or containing one from another server | `400 Reorder payload must include exactly the server's current channels` — the "full set required" rule from Technical approach; no partial write. |
| `categoryId` pointing at a category from a different server | `400 Category not found` (reuses `requireCategoryInServer`, same message as `updateChannel` today). |
| Two moderators submit overlapping reorders concurrently | Both requests are independent transactions; whichever commits second determines the final order — no partial interleave within either request (each is one transaction), and both moderators' clients receive `channels:reordered`/`categories:reordered` and refetch, so both end up looking at the same final state, with the "loser" seeing their drag visually reverted by the refetch rather than silently diverging. |
| Unauthorized (no `ManageChannels`) | `403`, unchanged pattern; no event emitted, matching `channel-live-settings-sync.md`'s existing edge case for `updateChannel`. |
| Reorder request for a server the caller is not a member of | `404`, via the same `requireServerPermission` path every other channel/category write already uses. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/src/modules/channels/dto/reorder-channels.dto.ts` | New — `ReorderChannelsDto`. |
| `apps/api/src/modules/channels/dto/reorder-categories.dto.ts` | New — `ReorderCategoriesDto`. |
| `apps/api/src/modules/channels/channels.controller.ts` | Add `PUT servers/:serverId/channels/order`. |
| `apps/api/src/modules/channels/channels.service.ts` | Add `reorderChannels`; import `RealtimeEvents`/`RealtimePublisher` (already imported). |
| `apps/api/src/modules/channels/categories.controller.ts` | Add `PUT servers/:serverId/categories/order`. |
| `apps/api/src/modules/channels/categories.service.ts` | Add `reorderCategories`; **newly imports `RealtimePublisher`** (not imported today). |
| `packages/shared/src/realtime-events.ts` | Add `ChannelsReordered`, `CategoriesReordered`. |
| `apps/web/src/api.ts` | No new types needed beyond existing `Channel`/`ChannelCategory`; add request helper(s) if the repo's pattern calls one out (see open question below — `api.ts` has no direct HTTP calls today; reorder requests are issued the same way `useWorkspaceNavigation.ts` already calls `apiRequest` directly). |
| `apps/web/src/hooks/useWorkspaceNavigation.ts` | Add `reorderChannels`, `reorderCategories` actions, following `updateCategory`'s shape (`:237-265`). |
| `apps/web/src/hooks/useServerModeration.ts` | Add `handleChannelsReordered`, `handleCategoriesReordered` listeners. |
| `apps/web/src/components/workspace/ChannelSidebar.tsx`, `ChannelList.tsx` | Wrap `CategorySection`/`ChannelGroup`/`ChannelRow` rendering with `@dnd-kit` sortable context; add drag handles. |
| `apps/web/src/components/settings/ChannelSettings.tsx` | Remove the "Position" field. |
| `apps/web/src/components/workspace/EditCategoryDialog.tsx` | Remove the "Position" field. |
| `apps/web/src/i18n/locales/{en,vi}/channels.ts` | New keys for drag handle labels / announcements. |
| `apps/web/package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable` (pending user approval). |

**API contract**

- `PUT /servers/:serverId/channels/order`
  - Request: `{ channels: Array<{ id: string; categoryId: string | null; position: number }> }`
  - Response `200`: `{ channels: Channel[] }`
  - Errors: `400` (validation, see Edge cases) · `403` (no `ManageChannels`) · `404` (server/channel
    not found)
- `PUT /servers/:serverId/categories/order`
  - Request: `{ categories: Array<{ id: string }> }`
  - Response `200`: `{ categories: ChannelCategory[] }`
  - Errors: `400` · `403` · `404`

**DB / migration**

- **No schema change, no migration.** `Channel.position` and `ChannelCategory.position` already exist
  as plain `Int` columns (`channels.prisma:14,31`) and already accept any integer via the existing
  `UpdateChannelDto.position`/`UpdateCategoryDto.position` (both already `@IsInt() @Min(0)`,
  `update-channel.dto.ts`, `update-category.dto.ts`). The chosen dense-rewrite scheme reuses these
  columns as-is. The pre-existing lack of a `@@unique([serverId, position])`/
  `@@unique([categoryId, position])` constraint is not added by this doc (see Risks) — adding one would
  need every existing server's rows deduplicated first (an unverified data cleanup outside this doc's
  scope) and is not required to satisfy the acceptance criteria, since the server-side rewrite already
  guarantees uniqueness for the rows it touches.

**Libraries** — `@dnd-kit/core` + `@dnd-kit/sortable` (new, needs approval — see Web section above).
No other new dependency; reuses `prisma.$transaction` (already used by `updatePermissionOverrides`,
`channels.service.ts:162`), `RealtimePublisher.emitToRoom` (already used by `updateChannel`), and
`apiRequest`/React Query invalidation (already used throughout `useWorkspaceNavigation.ts`/
`useServerModeration.ts`).

## Trade-offs

Position scheme and bulk-vs-per-row are covered in detail above (Changes → API, Changes → Position
scheme); the remaining trade-off is the drag library choice:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): `@dnd-kit`** | Built-in keyboard sensor, actively maintained, MIT, tree-shakeable (`core`+`sortable` only, no unused packages). | New dependency; ~10 kB combined gzipped (inferred from the library's own published numbers, not independently measured in this session). | Chosen — smallest well-maintained option that satisfies the keyboard-accessibility requirement without hand-rolling `pointerdown`/`pointermove` state machines. |
| B: `react-beautiful-dnd` | Very well-known, similar API shape. | Effectively unmaintained (no active development, React 18 strict-mode issues reported upstream); weaker keyboard support out of the box. | Rejected — maintenance risk and weaker keyboard story. |
| C: hand-rolled pointer events, no library | Zero new dependency. | Rebuilding pointer capture, auto-scroll-while-dragging, touch handling, and keyboard equivalence from scratch is exactly the "significant custom pointer code" `channel-categories.md:89` already flagged as a cost when it deferred this feature; higher bug surface for a UI interaction pattern (cross-list drag) this repo has never implemented before. | Rejected — cost outweighs saving one small dependency, and the accessibility requirement is non-negotiable per the task. |

## Risks & rollback

- **What can break**: a bug in the "full set required" validation could reject a legitimate reorder if
  the client's view of the channel/category list is stale (e.g., another moderator created a channel
  between the client's last fetch and this drag) — the `400` in that case is the correct, safe failure
  (matches "what happens when this exact request arrives twice/out of order" from
  `failure-and-state.md`); the client should retry after a `serverDetail` refetch rather than retry
  blindly with the stale payload.
- **Not covered**: the pre-existing absence of a DB-level uniqueness constraint on
  `(serverId, position)`/`(categoryId, position)` stays unenforced — this doc's server-side rewrite
  keeps positions correct for rows it writes, but a future write path that bypasses `reorderChannels`/
  `reorderCategories` (e.g. a bug in `updateChannel`'s single-row `position` write) could still
  reintroduce a collision undetected by any DB constraint. Naming it here per
  `~/.claude/rules/failure-and-state.md` → Invariants: nothing today detects a duplicate-position row;
  recommend a follow-up query/report if this becomes an observed problem, not part of this doc.
  Category rename/other-field updates still do not broadcast live (`categories.service.ts` gap noted
  in Current behavior) — only the new reorder endpoints gain realtime sync.
- **Rollback**: revert the code. No migration to unwind (no schema change). If the dependency was
  already installed and code partially shipped, removing the two new routes and the dnd-kit UI wiring
  returns the app to today's single-`PATCH`-position-field behavior exactly; no persisted data needs
  correcting since the write path (dense integers per category) is compatible with what
  `createChannel`/`createCategory` already write.

## Test plan

Not covered by automated tests — this repo has no test suite (`package.json` scripts confirmed: no
`test` script at the root or in `apps/api`/`apps/web`), per `RULE.md`/`AGENT.md`'s existing convention
already noted by `channel-live-settings-sync.md`.

**Manual**

1. As a `ManageChannels` holder, drag a text channel from slot 3 to slot 1 within the same category →
   `PUT /servers/:serverId/channels/order` fires once → sidebar shows the new order immediately
   (optimistic) → reload the page → order persists.
2. Drag a channel from Category A into Category B, into the middle of B's list → one request, both the
   `categoryId` and every affected position update; channel now renders under Category B at the
   dropped slot.
3. Drag Category B above Category A → `PUT /servers/:serverId/categories/order` fires; sidebar shows B
   before A; reload → persists. Verify no channel's `categoryId` changed (categories reorder is
   independent of channel reorder).
4. **Keyboard path**: Tab to a channel row's drag handle, press Space to pick it up, press Arrow Up
   twice, press Space to drop → same result as the mouse drag in scenario 1, verified without touching
   the mouse.
5. **Two-client concurrent reorder**: open the same server in two sessions, both members with
   `ManageChannels`. In tab A, drag channel X to the top of the list; in tab B (started dragging before
   A's request completes), drag channel Y to the top of the list. After both requests resolve, both
   tabs receive `channels:reordered` and refetch — verify both tabs converge on the *same* final order
   (whichever request's transaction committed last), with no channel appearing twice or disappearing,
   and the "losing" tab's own drag visually reverts rather than silently staying wrong.
6. **Failure case**: with browser devtools, force the `PUT` to return `500` (or disconnect network)
   mid-drag → verify the optimistic reorder rolls back to the last-known-good order and an error
   message appears (not a frozen/wrong sidebar).
7. **Unauthorized**: as a member without `ManageChannels`, verify no drag handle renders (mirrors the
   existing "Create category" gating in `channel-categories.md:83`) and, calling the endpoint directly
   with devtools, confirm `403`.
8. Run `npm run i18n:check` and confirm it passes with the new keys added to both `en` and `vi`
   `channels.ts`.
9. At a 390×844 viewport, confirm tapping a channel row (outside the drag handle) still opens the
   channel, and dragging from the handle still works via touch.

## Deployment notes

- New env vars: none.
- Migration: none — no schema change (see Technical approach → DB / migration).
- New dependency: `@dnd-kit/core` + `@dnd-kit/sortable` — needs `package-lock.json` updated in the
  same commit as `apps/web/package.json`, and the user's explicit approval before this is implemented
  (per `~/.claude/rules/typescript.md`).
- Cache/queue to clear: none.
- Shared package (`packages/shared`) must be rebuilt before the API/web typecheck/build, since
  `RealtimeEvents.ChannelsReordered`/`CategoriesReordered` are new exports both apps import — same
  build-order note `channel-live-settings-sync.md` already recorded for `ChannelUpdated`.
- Breaking API change: none — both new routes are additive; existing `PATCH /channels/:channelId` and
  `PATCH /categories/:categoryId` keep accepting a `position` field unchanged (kept for any caller that
  still uses it, e.g. the transition period before the "Position" field is removed from the UI).
- `docs/features/channel-categories.md`'s own "Out of scope" line ("drag-and-drop reordering") and
  Trade-offs line ("No drag-and-drop", `:89`) should be updated to point at this doc once implemented —
  not done in this change, since this task doc is not yet approved.
