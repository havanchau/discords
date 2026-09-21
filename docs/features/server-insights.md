# Server Insights

Read-only analytics panel in server settings, showing member and message activity for the last 7 or 30 days. Discord-parity "Insights" tab, `MANAGE_SERVER`-gated.

- **Status**: draft — awaiting review
- **Date**: 2026-09-18
- **Related**: `docs/features/timed-notification-mute.md`, `docs/features/server-events.md` (sibling flat docs, same style)

## Goal

Server owners/admins have no visibility today into how active their server is — no member growth, no message volume, no "which channel is actually used" signal. `AuditLog` (`apps/api/prisma/models/servers.prisma:195-207`) records individual moderation events but nothing aggregates them, and no endpoint or UI exposes message counts at all.

**Acceptance criteria**:

- [ ] `GET /servers/:serverId/insights?range=7d|30d` returns, for the chosen range: members joined, members left, members kicked, members banned (daily series + total), messages sent per day (daily series + total), and the top 5 text/forum channels by message count.
- [ ] Only `MANAGE_SERVER` holders can call it; anyone else gets `403`.
- [ ] A new "Insights" section appears in server settings, gated the same way as the neighboring `MANAGE_SERVER` sections, with loading, empty (server younger than the range or zero activity), and error states.
- [ ] Numbers match a direct count against `Message`/`ServerMember`/`AuditLog` for the same window (verified manually, see Test plan).

## Scope

**In scope**

- 7-day and 30-day ranges, UTC day buckets, computed live from existing tables at request time.
- Members joined, left, kicked, banned; messages per day; top channels by message count.
- One new API endpoint, one new settings section, no schema change beyond what already exists.

**Out of scope**

- Voice minutes: no voice-session duration is recorded anywhere in the codebase today — grepped `apps/api/prisma/models/*.prisma` and `apps/api/src/modules/livekit`, `apps/api/src/modules/realtime` for `durationMs`/`CallSession`/voice-minutes tracking and found only `SoundboardClip.durationMs` (`apps/api/prisma/models/servers.prisma:85-97`, an upload field, unrelated) and no call-duration model at all. Adding call-duration tracking is a separate, larger feature (a new model plus instrumenting call start/end in `apps/api/src/modules/livekit` and `apps/api/src/modules/realtime/call-registry.service.ts`) and is not part of this doc.
- Ranges other than 7d/30d, CSV/export, retention beyond what the source tables already keep, per-member leaderboards (top posters), reaction/thread-specific stats.
- A daily-rollup table or scheduled aggregation job (see Trade-offs) — this ships as live queries only.
- Changing `AuditLog` retention or adding a `ServerMember` leave-history table — not needed (see Current behavior).

## Current behavior

- **Members joined**: `ServerMember.joinedAt` (`apps/api/prisma/models/servers.prisma:135`), set on insert, default `now()`. A per-server, per-day count of joins is a direct `GROUP BY` on this column; no gap in the data.
- **Members left are not tracked on `ServerMember`**: leaving deletes the row — `server-moderation.service.ts:83` `leave()` does `tx.serverMember.delete({ where: { id: member.id } })`. Kick does the same (`server-moderation.service.ts:52`), ban does `tx.serverMember.deleteMany(...)` (`server-moderation.service.ts:157`). So a live `COUNT` of "members who left" against `ServerMember` is impossible — the rows are gone.
- **But every removal is already audited**: `leave()` writes `writeAuditLog(serverId, userId, 'MEMBER_LEAVE', ...)` (`server-moderation.service.ts:82`), `kick()` writes `'MEMBER_KICK'` (`server-moderation.service.ts:56`), `ban()` writes `'MEMBER_BAN'` (`server-moderation.service.ts:183`). `AuditLog` has `action`, `createdAt`, and is indexed `@@index([serverId, createdAt])` (`apps/api/prisma/models/servers.prisma:206`) — exactly the shape needed to count leaves/kicks/bans per day without any new recording. This means the "members left/banned" acceptance criterion is fully answerable from data that already exists.
- `listAuditLogs` (`apps/api/src/modules/servers/servers.service.ts:203-221`) is the existing precedent for this exact gate: `requireServerPermission(userId, serverId, Permission.ManageServer)` (line 205), `403` via `ForbiddenException` thrown from `PermissionsService.requireServerPermission` (`apps/api/src/modules/permissions/permissions.service.ts:32-43`) when the caller lacks the permission or isn't a member at all.
- **Messages**: `Message` (`apps/api/prisma/models/messages.prisma:36-58`) has `createdAt`, `channelId`, `serverId`, and a soft-delete `deletedAt DateTime?`. Already indexed `@@index([channelId, createdAt])` and `@@index([channelId, authorId, createdAt])` (lines 56-57) — no index on `[serverId, createdAt]`, so a per-server daily count needs a new index (see Technical approach). No `serverId`-based index exists on `Message` today (grepped the model, only the two `channelId`-scoped indexes above).
- **Channels**: `Channel.name`, `Channel.type` (`apps/api/prisma/models/channels.prisma:25-26`); a channel can be `isPrivate` (line 30) — a private channel's message count would leak its existence/activity to a `MANAGE_SERVER` holder who is not in it; current moderation UI (e.g. `listAuditLogs`) does not filter private-channel content out, but insights aggregates should still not name a private channel the viewer cannot see (see Changes → Edge cases).
- **Permissions enum** (`packages/shared/src/permissions.ts:1-16`): no `VIEW_INSIGHTS`-style permission exists; the closest precedent is reusing `MANAGE_SERVER`, which already gates `listAuditLogs` and most of `ServerSettings.tsx`'s sections (`apps/web/src/components/settings/ServerSettings.tsx:196-226`).
- **Scheduling infra**: no `@nestjs/schedule` dependency (checked `apps/api/package.json`, present only in devDependencies is `@nestjs/schematics`, not `@nestjs/schedule`). The one existing periodic job, `ReminderSweepService` (`apps/api/src/modules/saved-messages/reminder-sweep.service.ts:18-36`), uses a plain `setInterval` set in `onApplicationBootstrap`, with no cross-instance lock — correctness relies on a conditional `updateMany` claim, not a scheduler library. `server-events.md`'s Trade-offs section independently reached the same conclusion for computed-vs-scheduled status: "no job infrastructure exists ... computing from timestamps is always correct."
- **Chart library**: `apps/web/package.json` has no charting dependency (grepped for `chart`, `recharts`, `d3`, `victory` — no match). The repo's existing "numeric summary" UI (`ReportsSection.tsx`, `ServerSettings.tsx`'s audit-log list) uses plain HTML/CSS, no chart widgets anywhere in `apps/web/src/components`.
- **Web settings pattern**: sections are gated inline with `memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER')` (e.g. `ServerSettings.tsx:196-226`); data is fetched through `useLazyResource` keyed by `queryKeys.<name>(serverId)` and an `apiRequest` call, e.g. `auditLogsResource` (`apps/web/src/hooks/useSettingsActions.ts:91-98`) reading `queryKeys.auditLogs` (`apps/web/src/query/queryKeys.ts:24`).
- Latest migration folder: `apps/api/prisma/migrations/20260918007000_add_stage_channels` — a new migration follows the same `YYYYMMDDHHmmss_description` naming.

## Changes

### Rules / Flow

1. `GET /servers/:serverId/insights?range=7d|30d` (default `7d` when omitted; any other value is `400`).
2. Day buckets are UTC calendar days (`date_trunc('day', "createdAt")` at UTC, matching the server's existing "UTC everywhere" convention — no per-viewer timezone conversion server-side, same as `server-events.md`'s stored `startAt`/`endAt`).
3. The range's start is `today (UTC) - (7|30) days`, inclusive of today; a server younger than the range only has data from its `createdAt`.
4. Response includes, per range:
   - `membersJoined`: daily series `{ date, count }[]` + `total`, from `ServerMember.joinedAt`.
   - `membersLeft`, `membersKicked`, `membersBanned`: daily series + total, each from `AuditLog` filtered by `action = 'MEMBER_LEAVE' | 'MEMBER_KICK' | 'MEMBER_BAN'` and `serverId`. (A member who is later kicked after having left and rejoined produces two separate `AuditLog` rows on two different `joinedAt`/removal dates — expected, not deduplicated.)
   - `messagesPerDay`: daily series `{ date, count }[]` + `total`, from `Message` where `serverId` matches, `deletedAt IS NULL` (soft-deleted messages are excluded — they are not real activity a moderator should count as "sent"), bucketed by `createdAt`.
   - `topChannels`: up to 5 `{ channelId, name, type, messageCount }`, `Message` grouped by `channelId` within the same window and `deletedAt IS NULL`, joined to `Channel` for `name`/`type`, **excluding channels where `isPrivate = true` and the caller lacks `VIEW_CHANNEL`** on them (reuses `PermissionsService`'s existing per-channel check, same pattern as `notifyMentionedUsers`'s `ViewChannel` check referenced in `timed-notification-mute.md`).
5. All five metrics are computed live, in parallel (`Promise.all`), against the existing tables — no new table, no background job (see Trade-offs).

### Edge cases

| Case | Expected behavior |
|---|---|
| Server younger than the range (e.g. created 2 days ago, `range=30d`) | Series only has entries from `createdAt` onward; days before creation are simply absent from the array (client fills zero, does not request a "hasData" flag). |
| No activity at all in range | Every series is an array of zeroed days (or empty array, see Technical approach), `total: 0`; UI shows the empty state, not an error. |
| Private channel in `topChannels` | Excluded for a viewer without `VIEW_CHANNEL` on it, even though the viewer has `MANAGE_SERVER`; `MANAGE_SERVER` does not imply channel visibility today (no code path where it does — grepped `PermissionsService` for such a shortcut, none found). |
| `range` param missing | Defaults to `7d`. |
| `range` param invalid (e.g. `range=1d`) | `400`. |
| Caller not a member of the server | `403` (via `requireMembership` inside `requireServerPermission`, same as every other server-scoped endpoint). |
| Caller is a member but lacks `MANAGE_SERVER` | `403`. |
| Duplicate leave/rejoin/leave in the window | Counted each time it happened — `membersJoined` and `membersLeft` are independent series, not a running membership delta. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/prisma/migrations/<timestamp>_add_message_server_created_at_index/migration.sql` | New index: `Message(serverId, createdAt)`. |
| `apps/api/prisma/models/messages.prisma` | Add `@@index([serverId, createdAt])` to `Message` to match. |
| `apps/api/src/modules/servers/server-insights.service.ts` (new) | `getInsights(userId, serverId, range)`: permission check, five parallel queries, shape the response. |
| `apps/api/src/modules/servers/servers.controller.ts` | New `GET /servers/:serverId/insights` route, `range` query param via a small DTO (`@IsIn(['7d','30d'])`). |
| `apps/api/src/modules/servers/servers.module.ts` | Register `ServerInsightsService` (or fold into existing `servers.service.ts` if it stays under ~1000 lines — check current line count before deciding, per `rules/typescript.md`'s file-size limit). |
| `packages/shared/src/api-contract.ts` | New `ServerInsights`, `InsightsRange`, `InsightsDailyCount` types. |
| `apps/web/src/api.ts` | `getServerInsights(serverId, range)` calling the new endpoint. |
| `apps/web/src/query/queryKeys.ts` | `insights: (serverId: string, range: InsightsRange) => ['insights', serverId, range] as const`. |
| `apps/web/src/hooks/useSettingsActions.ts` | New `useLazyResource` (or a plain fetch-on-open hook, since insights has no mutation) for insights, following the `auditLogsResource` pattern. |
| `apps/web/src/components/settings/ServerInsightsSection.tsx` (new) | Range toggle (7d/30d), simple bar rows for messages-per-day and top channels (CSS `width: %` bars, no chart library — see Trade-offs), loading/empty/error states matching `ReportsSection.tsx`'s pattern. |
| `apps/web/src/components/settings/ServerSettings.tsx` | Render `ServerInsightsSection` gated by `memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER')`, placed near the audit-log section. |
| `apps/web/src/i18n/locales/en.ts`, `vi.ts` | New keys: section title/hint, range labels, metric labels, empty/error strings. |

**API contract**

- `GET /servers/:serverId/insights?range=7d|30d`
- Response `200`:
  ```
  {
    range: '7d' | '30d',
    generatedAt: string; // ISO, UTC
    membersJoined: { series: { date: string; count: number }[]; total: number };
    membersLeft: { series: { date: string; count: number }[]; total: number };
    membersKicked: { series: { date: string; count: number }[]; total: number };
    membersBanned: { series: { date: string; count: number }[]; total: number };
    messagesPerDay: { series: { date: string; count: number }[]; total: number };
    topChannels: { channelId: string; name: string; type: string; messageCount: number }[];
  }
  ```
- Errors: `400` invalid `range` · `403` not a member, or member without `MANAGE_SERVER` · `404` server not found (existing `requireMembership`/`requireServerPermission` behavior for an unknown `serverId` — inferred from the same pattern in `listAuditLogs`, not separately re-verified here).

**DB / migration**

- Table: `Message`. New index: `@@index([serverId, createdAt])`.
- Migration file: `apps/api/prisma/migrations/<timestamp>_add_message_server_created_at_index/migration.sql`, hand-written:
  ```sql
  CREATE INDEX "Message_serverId_createdAt_idx" ON "Message"("serverId", "createdAt");
  ```
  with `down()` dropping it. `Message` is the largest table in the schema (every channel message); creating a plain `CREATE INDEX` (not `CONCURRENTLY`) takes a table-level lock for the duration of the build, which on a large production table could be a multi-second-to-minute write-blocking operation — **flagged for the user to confirm the deployment window and whether `CREATE INDEX CONCURRENTLY` (needs to run outside a transaction, so outside Prisma's normal migration transaction) is required instead.** No other schema change; `AuditLog` and `ServerMember` already have the indexes this feature needs (`@@index([serverId, createdAt])` on `AuditLog`, already exists).
- No new table for daily rollups (see Trade-offs).

**Libraries** — none new. Bars/series are rendered with plain CSS (`width: ${pct}%`), matching the repo's existing "no chart dependency" state; adding e.g. `recharts` (~90KB gzipped) is not justified for five simple bar/line series when CSS bars cover the same acceptance criteria.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): live aggregate queries per request** | No new job, no rollup table to keep in sync, matches the repo's existing "compute from source data" pattern (`server-events.md`'s computed status; `timed-notification-mute.md`'s read-time `isMuteActive`); always accurate, including for the just-happened event. | Each request runs 5 queries (members joined, 3 `AuditLog` action counts — can collapse to one grouped query, see below — messages per day, top channels); on a very large `Message` table this is the query the new index targets. | Chosen — no scheduler exists in this repo (`ReminderSweepService` is the only precedent and is a plain `setInterval`, not a shared scheduling library), and daily-rollup freshness/backfill is unneeded complexity for a feature whose own acceptance criteria only ask for 7/30-day windows. |
| B: `ServerDailyStat` rollup table filled by a scheduled job | Reads are O(1) regardless of `Message` table size; historical data survives even if raw messages are later purged. | Needs a new model + migration, a sweep job (no `@nestjs/schedule` installed — would be the first use of it, or a hand-rolled `setInterval` like `ReminderSweepService`), multi-instance duplicate-write handling (`ReminderSweepService`'s conditional-claim pattern would need to be replicated for an upsert-per-day), and a **backfill problem**: historical `MEMBER_LEAVE`/`MEMBER_KICK`/`MEMBER_BAN` events already exist in `AuditLog` and could be backfilled, but historical messages-per-day for periods before this feature ships would need a one-time backfill script reading all of `Message` — expensive and a second migration-adjacent script this doc would have to fully specify. | Rejected for now — revisit only if live query latency is measured to be a real problem (per `rules/performance.md`: measure before optimizing); the doc names this so it isn't silently ruled out. |
| C: cache the live query result (e.g. 5-minute TTL) | Cuts repeated-query cost for a popular server's settings panel being reopened often. | No cache infrastructure identified in this grep pass (not confirmed either way — inferred absence, see open questions); adding one needs an explicit invalidation story per `rules/performance.md` ("cache only with a stated invalidation plan"), and insights data does not need to be real-time to the second, but nor is it clear the query is slow enough to need caching without measuring first. | Rejected for v1 — no measured latency problem yet; add later if opening the panel proves slow in practice. |
| D: reuse the existing `permissions.ts` enum vs. add `VIEW_INSIGHTS` | A dedicated permission would let a role see insights without full `MANAGE_SERVER`. | Every other "moderator dashboard" section in this repo (`listAuditLogs`, most of `ServerSettings.tsx`) reuses `MANAGE_SERVER` rather than growing a new permission per panel; adding one is a bigger, unrelated change (new enum value ships to every role everywhere, per `rules/backend-nestjs.md`'s i18n-key precedent for "ships to every locale in the same change" — a new permission has an equivalent "ships everywhere" cost). | Reuse `MANAGE_SERVER`, matching `listAuditLogs`'s precedent exactly. |

What the chosen option (A) costs: read latency scales with `Message` table size until/unless the new `[serverId, createdAt]` index is confirmed sufficient under real data volume; no historical data beyond what `AuditLog`/`Message`/`ServerMember` already retain (there is no separate retention policy to define, since nothing is newly stored).

## Risks & rollback

- **What can break**: the new `Message` index changes nothing functionally but its creation is a locking DDL operation on the largest table in the schema — see the lock-duration flag in DB / migration above. Must be scheduled deliberately, not run casually.
- **What can break**: a private channel's message volume/name must not leak to a `MANAGE_SERVER` holder who cannot view it — the `topChannels` filter (Rules item 4) is the mitigation; a bug here is an information-disclosure risk, not just a display bug, and should get explicit review at implementation time.
- **Not covered**: voice minutes (see Scope), per-member breakdowns, any range other than 7d/30d, historical data predating this feature's own launch for anything not already in `AuditLog`/`Message`/`ServerMember`.
- **Rollback**: revert the code; the migration only adds an index, so `down()` (`DROP INDEX`) is safe and lossless — no data was written by this feature, only read.

## Test plan

Not covered by automated tests (repo has no test suite by policy).

**Manual**

1. As the server owner, open settings → Insights on a server with recent joins/leaves/messages across at least 2 different channels → verify `membersJoined`/`membersLeft`/`messagesPerDay` totals match a manual count (e.g. via a `SELECT count(*) FROM "ServerMember" WHERE "serverId" = ... AND "joinedAt" >= ...` run against a local/dev DB) for both `7d` and `30d`.
2. As a member without `MANAGE_SERVER`, call `GET /servers/:serverId/insights` directly → `403`, and the Insights section does not render in the settings UI.
3. As a non-member, call the endpoint → `403`.
4. `GET /servers/:serverId/insights?range=1d` → `400`.
5. On a server created less than 7 days ago, request `range=30d` → series only covers days since creation, no error.
6. On a server with a private channel the viewer (a `MANAGE_SERVER` holder not in that channel) cannot view, and that channel has message activity → `topChannels` excludes it.
7. On a server with zero messages/joins/leaves in the window → empty state renders, not an error.
8. `npm run typecheck`, `npm run lint`, `npm run build` (check `apps/api/package.json` and `apps/web/package.json` for exact script names) run clean after the change.
9. `npm run i18n:check` passes after adding the new `en.ts`/`vi.ts` keys.

## Deployment notes

- New env vars: none.
- Migration `<timestamp>_add_message_server_created_at_index` should run before deploying the API change that queries it; confirm with the user whether `CREATE INDEX CONCURRENTLY` is required for the production `Message` table size before running it there (see DB / migration).
- Shared package (`packages/shared`) must be rebuilt before the API/web build, per the repo's monorepo build order.
- No cache/queue to clear (no caching introduced, see Trade-offs).
- No breaking API change: this is a new, additive endpoint.
- Add the new i18n strings to `en.ts` and `vi.ts` and run `npm run i18n:check` before merging the web change.
