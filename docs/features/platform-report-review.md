# Feature Spec: Platform Report Review

A review surface for `ServerReport` rows filed from public discovery, so reports stop accumulating with no action path.

## Goal

Give a small set of trusted accounts (`User.platformRole = ADMIN`) a queue to list, filter, and resolve `ServerReport` rows — dismiss a report, or delist the reported server from discovery — with an audit trail of who acted and when. This closes the gap `server-templates-and-discovery.md` calls out: "`ServerReport` rows with no review surface today are a dead end without one" (`docs/features/server-templates-and-discovery.md:140`), and answers open question #16 ("Is a moderation review UI required before discovery listing goes to production?", `docs/features/open-questions.md:20`).

Acceptance criteria:

- `User.platformRole` exists (`USER` default, `ADMIN`), set only by a DB write, seed, or a standalone script — never by any API endpoint.
- Every `/platform/*` route requires the caller's `platformRole` to be `ADMIN`, checked fresh from the database on each request, not trusted from the JWT.
- `GET /platform/reports` lists `ServerReport` rows, paginated (hard max page size), filterable by `serverId` and by a computed status (`OPEN` / `DISMISSED` / `SERVER_DELISTED`).
- `GET /platform/reports/:reportId` returns the report plus a server summary (name, description, tags, member count, `listed`, owner).
- `POST /platform/reports/:reportId/dismiss` and `POST /platform/reports/:reportId/delist` transition a report, are audited, and a non-admin gets `403` from every `/platform/*` route.
- A web "Platform Admin" section is visible only when the signed-in user's own profile response says `platformRole: 'ADMIN'`.
- New UI strings ship in `en` and `vi` in the same change (`npm run i18n:check`).

## Scope

**In scope**

- `PlatformRole` enum and `User.platformRole` column (migration only — no seed data changes required by this doc, see Deployment notes for how a local admin is created).
- A `PlatformAdminGuard` that re-reads the role from the database per request.
- List/detail/resolve endpoints for `ServerReport`, response DTOs, pagination.
- A `PlatformReportStatus` derived value (`ServerReport` itself gains no `status` column — see Changes) and a `PlatformActionLog` (or reuse of `AuditLog`, decided in Technical approach) for who dismissed/delisted and when.
- A `apps/web` admin page/section gated on `platformRole`.
- Recommendation on open question #15 (merge `MessageReport` and `ServerReport`?).

**Out of scope**

- Any UI or endpoint to grant/revoke `platformRole` (explicitly DB/seed/script only, per the 2026-09-18 decision).
- Reviewing `MessageReport` (server-level moderator queue, already covered by `docs/features/message-reports.md`) — this doc's queue is for `ServerReport` only, see Trade-offs for why they stay separate.
- Automated moderation, content scanning, or appeals.
- A general-purpose platform-admin panel (user bans, server takedowns beyond delisting) — delisting from discovery is the only administrative action added here.

## Current Behavior

- `ServerReport` has no status field: `id, serverId, reporterId, reason, details, createdAt` only (`apps/api/prisma/models/discovery.prisma:34-46`). The only reads of `serverReport` in the codebase are `server-discovery.service.ts:143` (checking for a recent duplicate report before creating a new one) and `account-export-collector.ts:257` (including a user's own filed reports in their personal data export) — no controller or service lists reports for a reviewer; `POST /discovery/servers/:serverId/report` (`server-templates-and-discovery.md:168`) is otherwise a write-only sink today.
- `User` has no role/permission field beyond server-scoped ones; `packages/shared/src/permissions.ts` only defines server-scoped permission bits (cited in `docs/features/message-reports.md:126`, "the codebase has no platform-admin role or cross-server permission concept").
- `JwtAuthGuard` (`apps/api/src/modules/auth/jwt-auth.guard.ts:18-57`) already re-reads the session and its `user` relation from the database on every request and puts a hand-picked subset (`id`, `email`, `username`, `sessionId`, `locale`) onto `request.user` (`apps/api/src/modules/auth/jwt-auth.guard.ts:46-52`) — it does not carry any role today.
- The only precedent for a second, non-session credential guard is `BotAuthGuard` (`apps/api/src/modules/bots/bot-auth.guard.ts:27-71`): it re-checks the bot row from the database on every request rather than trusting anything embedded in a token, and it is added as an extra route-scoped `@UseGuards`, not folded into `JwtAuthGuard`.
- `AuditLog` is `serverId`-scoped and required (`apps/api/prisma/models/servers.prisma:192-205`); `account-deletion-and-export.md` already ran into this for a cross-server event and chose the application logger over `AuditLog` ("Cross-server audit gap", `docs/features/account-deletion-and-export.md` Trade-offs) because logging to one arbitrary server's audit log "would pollute every server's audit log with an unrelated account event."
- `apps/api/prisma/seed.ts:1-30` creates two demo users (`demo@example.com`, `teammate@example.com`) via `prisma.user.upsert`, with no role concept at all.

## Changes

### Rules / Flow

1. `PlatformRole { USER, ADMIN }` is added to the schema; `User.platformRole PlatformRole @default(USER)`. No DTO, controller, or service method ever accepts or sets this field from a client request — the only writers are: the Prisma migration's default, `apps/api/prisma/seed.ts` (an explicit, named seed admin for local dev), and a one-off maintenance script run directly against the database (see Deployment notes). This mirrors the repo's existing pattern of a privileged flag that is never client-settable (`Bot.tokenHash`, `User.deletionCompletedAt`).
2. `PlatformAdminGuard` (new, modeled on `BotAuthGuard`'s "re-check from the database, do not trust the token" shape): runs **after** `JwtAuthGuard` on every `/platform/*` route, reads `request.user.id` (already verified by `JwtAuthGuard`), and does its own `prisma.user.findUnique({ where: { id }, select: { platformRole: true } })`. `platformRole !== 'ADMIN'` throws `403`. This is a second DB round trip per request, deliberately not cached and not embedded in the JWT — see Trade-offs.
3. `GET /platform/reports?status=&serverId=&cursor=`: since `ServerReport` has no status column, "status" is computed from two new nullable columns added to `ServerReport` in this change — `resolvedAt: DateTime?`, `resolvedById: String?`, `resolution: PlatformReportResolution?` (`DISMISSED | SERVER_DELISTED`). `status=OPEN` means `resolvedAt IS NULL`; `status=DISMISSED` / `status=SERVER_DELISTED` map to `resolution`. Sorted newest first, paginated with a keyset cursor (`<createdAt>_<id>`), page size capped at 50 (matches the discovery search cap precedent, `server-templates-and-discovery.md:164`).
4. `GET /platform/reports/:reportId` returns the report plus a `PlatformServerSummary` (`id, name, description, tags, memberCount, listed, ownerId, ownerDisplayName, createdAt`) resolved from the report's `serverId`. A report whose server was hard-deleted (the `ServerReport.server` relation is `onDelete: Cascade`, `apps/api/prisma/models/discovery.prisma:41` — so this case cannot actually occur; the report row disappears with the server) needs no handling; noted so a reviewer does not look for one.
5. `POST /platform/reports/:reportId/dismiss` sets `resolvedAt = now()`, `resolvedById = caller.id`, `resolution = DISMISSED`. Only valid when `resolvedAt IS NULL`; otherwise `409 Report is already resolved`.
6. `POST /platform/reports/:reportId/delist` sets the same resolution fields with `resolution = SERVER_DELISTED`, and in the same transaction sets `Server.listed = false` on the reported server (reusing the existing column, `apps/api/prisma/models/servers.prisma:19`). It does not touch `tags`/`description` (same "un-listing keeps them" rule already documented for the owner-initiated path, `server-templates-and-discovery.md:60`). Delisting an already-unlisted server still succeeds (idempotent on the `Server` side) but still requires `resolvedAt IS NULL` on the report itself.
7. Optional moderator note: `details` on the resolve request body (`{ note?: string }`, max 500 chars), stored as `ServerReport.resolutionNote`. Free text for "why," separate from the reporter's own `details`.
8. Audit: a platform action is not scoped to one server naturally (an admin acts from outside the server), but delisting *does* have exactly one server it affects, unlike account deletion's genuinely cross-server case. So — unlike account deletion — this doc writes to the existing `AuditLog` with `serverId = report.serverId`, `actorId = admin.id`, `action = 'PLATFORM_REPORT_DISMISS'` or `'PLATFORM_REPORT_DELIST'`, `targetId = report.id`. This is visible to that server's own `MANAGE_SERVER` holders in `GET /servers/:serverId/audit-logs` (existing endpoint — grepped, `apps/api/src/modules/servers` audit log read path) the same way any other action on their server is. That disclosure is intentional and named in Trade-offs, not a leak: a server that gets delisted for abuse should be able to see that it was delisted and by whom, the same way `CHANNEL_CREATE` metadata is already visible to that server's managers.

### Edge cases

| Case | Expected behavior |
|---|---|
| Report with `serverId` for a server the admin cannot otherwise see (private) | Allowed — a platform admin sees a `PlatformServerSummary`, not the private channel list; the summary fields are the same public subset `DiscoveryServerCard` already exposes plus `ownerId`/`ownerDisplayName`/`listed`. |
| Non-admin calls any `/platform/*` route | `403`, same shape as any other `ForbiddenException`. |
| Unauthenticated request | `401` from `JwtAuthGuard`, before `PlatformAdminGuard` runs. |
| Dismiss/delist an already-resolved report | `409 Report is already resolved`. |
| Delist a report whose server is already unlisted | `200`, resolution recorded, `Server.listed` stays `false` (no-op write). |
| `platformRole` changed on a user with an active session | Takes effect on their very next request, because `PlatformAdminGuard` re-reads it every time — no re-login or token refresh needed to revoke admin access. |
| Empty report list (no reports yet) | `{ reports: [], nextCursor: null }`, `200`. |

## Technical Approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/prisma/models/users.prisma` | Add `PlatformRole` enum, `User.platformRole` column. |
| `apps/api/prisma/models/discovery.prisma` | Add `resolvedAt`, `resolvedById`, `resolution`, `resolutionNote` to `ServerReport`; add `PlatformReportResolution` enum; add relation `resolvedBy User? @relation(...)`. |
| `apps/api/prisma/migrations/20260918005000_add_platform_admin_reports/` | New migration (see below for numbering). |
| `apps/api/src/modules/platform/platform-admin.guard.ts` | New — re-reads `platformRole` per request, modeled on `BotAuthGuard`. |
| `apps/api/src/modules/platform/platform-reports.service.ts` | New — list/detail/dismiss/delist. |
| `apps/api/src/modules/platform/platform-reports.controller.ts` | New — `@UseGuards(JwtAuthGuard, PlatformAdminGuard)`, routes below. |
| `apps/api/src/modules/platform/dto/list-platform-reports-query.dto.ts`, `resolve-platform-report.dto.ts` | New DTOs. |
| `apps/api/src/modules/platform/platform.module.ts` | New module; wired into `app.module.ts`. |
| `apps/api/src/modules/users/user-profile.ts` | Add `platformRole` to the "me" response shape so the web client knows whether to show the admin entry point (never trusted for authorization — only for showing/hiding the nav item; the guard is the real check). |
| `packages/shared/src/api-contract.ts` | `PlatformServerReportView`, `PlatformServerSummary`, `platformReportResolutions` tuple. |
| `apps/web/src/api.ts`, `apps/web/src/hooks/usePlatformReports.ts` | New — fetch/mutate the queue. |
| `apps/web/src/components/platform/PlatformReportsPage.tsx`, `PlatformReportDetail.tsx` | New — admin-only page/section. |
| `apps/web/src/i18n/locales/en.ts`, `vi.ts` | New `platform.*` keys. |
| `apps/api/prisma/seed.ts` | Add one named seed admin (see Deployment notes), never toggled by request-time code. |

**API contract**

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/platform/reports` | query: `status?, serverId?, cursor?` | `200 { reports: PlatformServerReportView[], nextCursor?: string }` |
| `GET` | `/platform/reports/:reportId` | — | `200 { report: PlatformServerReportView, server: PlatformServerSummary }` |
| `POST` | `/platform/reports/:reportId/dismiss` | `{ note?: string }` | `200 { report }` |
| `POST` | `/platform/reports/:reportId/delist` | `{ note?: string }` | `200 { report }` |

Errors: `401` no/invalid session · `403` authenticated but not `platformRole: ADMIN` · `404` unknown `reportId` · `409` already resolved.

`PlatformServerReportView`: `{ id, serverId, reason, details, createdAt, reporter: { id, displayName }, status: 'OPEN' | 'DISMISSED' | 'SERVER_DELISTED', resolvedAt, resolvedBy: { id, displayName } | null, resolutionNote }`.

**DB / migration**

- `User.platformRole PlatformRole @default(USER)` — additive, defaulted, safe on a populated table.
- `ServerReport.resolvedAt DateTime?`, `resolvedById String?`, `resolution PlatformReportResolution?`, `resolutionNote String?` — all nullable, additive.
- New index `@@index([resolvedAt, createdAt])` on `ServerReport` for the status filter.
- Migration name: `20260918005000_add_platform_admin_reports` — the next free slot after `20260917014000_add_stickers_and_soundboard` and after this batch's other in-flight docs, which the task brief reserves `20260918000000`–`20260918003999`; this doc's migration takes `20260918005000` to leave room.

**Libraries** — none new; reuses `class-validator` DTOs and the existing `PrismaService`/`RealtimePublisher` patterns already in every other module.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Re-read `platformRole` from DB every request via a guard (chosen)** | Revoking admin access takes effect immediately (no token refresh, no logout); matches the repo's existing `BotAuthGuard` precedent of never trusting a privileged claim baked into a signed token | One extra DB read per `/platform/*` request; this queue is low-traffic, so the cost is negligible | **Chosen** — the task explicitly asks for this, and it is consistent with how `JwtAuthGuard` itself already re-reads the session row rather than trusting only the JWT signature |
| Embed `platformRole` in the JWT payload | Zero extra DB read | A revoked admin keeps elevated access until their token expires (session tokens are short-lived but not instant); one more thing that must be kept in sync between the token and the DB, a footgun for a security-sensitive flag | Ruled out — the safety cost outweighs one DB read on a low-traffic admin surface |
| New `PlatformAdminGuard` as a **second, separate guard** on `/platform/*` routes, stacked after `JwtAuthGuard` | Keeps `JwtAuthGuard` unchanged and generic; every other route is unaffected; matches the `BotAuthGuard`-is-a-separate-guard precedent | Two guards to reason about per route instead of one | **Chosen** — smaller diff, and `JwtAuthGuard` staying generic means it is not coupled to a platform-admin concept that only a handful of routes need |
| Fold the role check into `JwtAuthGuard` itself (always populate `request.user.platformRole`) | One guard, slightly simpler controller decorators | Every authenticated request pays the extra `platformRole` read (or `JwtAuthGuard`'s existing user-fetch must select it, which is nearly free since the row is already fetched) even though almost no route needs it; couples a rarely-used field into the hot path of every request | Ruled out for the guard shape, but the *fetch* is actually free — see Risks: `JwtAuthGuard` already loads the full `session.user` row, so selecting `platformRole` there costs nothing extra; the guard still throws `403` in a dedicated `PlatformAdminGuard`, it just does not need its own second Prisma call. Revised into the Technical approach below. |
| Merge `ServerReport` review into `MessageReport`'s existing per-server moderator queue (open question #15) | One report model, one queue, less code | `MessageReport` is reviewed by that **server's own** `MANAGE_MESSAGES` holders (`docs/features/message-reports.md:43`) — the opposite trust boundary from `ServerReport`, which reports a server run by people who should not be the ones reviewing complaints about their own server. Merging would need a `reviewerScope` discriminator and two very different authorization paths bolted onto one model | **Recommend keeping them separate** — different reviewer population (platform admins vs. per-server moderators), different subject (a server as a whole vs. a message/user inside one), and no shared query pattern beyond both having a `reason` enum. Documented here to close open question #15 for this pairing: keep separate. |

**Revised technical note** (see the fourth trade-off row): `JwtAuthGuard` already does `include: { user: true }` on the session query (`apps/api/src/modules/auth/jwt-auth.guard.ts:39`), so `session.user.platformRole` is already in memory after that guard runs — no second `findUnique` is required. `PlatformAdminGuard` reads `request.user` set by `JwtAuthGuard`, so `JwtAuthGuard`'s `request.user` object gains a `platformRole` field (never used for anything except this guard's check and the "show the nav item" read in the web client), and `PlatformAdminGuard` becomes a plain synchronous check with no DB call of its own. This keeps the "read from DB per request, not trusted from the JWT" property (the JWT itself carries no role — only `sub`/`sid` — and the value comes from `JwtAuthGuard`'s already-mandatory session lookup) while avoiding a second query. Updated in "Files touched" and "API contract" above to reflect this — `PlatformAdminGuard` has no `PrismaService` dependency.

What the chosen option costs: a small increase to `JwtAuthGuard`'s selected columns (negligible), and a new module (`platform/`) that must be kept out of every existing route's guard list — a route becomes platform-admin-only only when someone deliberately adds `PlatformAdminGuard`, so a missing guard fails open toward being a normal authenticated route (safe default) rather than silently becoming admin-gated.

## Risks & Rollback

- **What can break**: none of the changed columns are read by existing code paths (`ServerReport`'s new columns are additive and nullable; `User.platformRole` defaults to `USER` and is not referenced anywhere else).
- **Not covered**: banning/deleting the reported server outright (only delisting), reviewing `MessageReport`, notifying the reported server's owner that they were delisted (no notification system reused here — flagged as a gap, not silently assumed).
- **Rollback**: revert the code; the migration is additive (new nullable columns, new defaulted column, new enums) and safe to leave in place or drop independently. No data is destroyed by rolling back.

## Test Plan

**Automated**: none — the repo forbids `*.test.ts`/`*.spec.ts` files (`RULE.md`). Verified with `npm run typecheck`, `npm run lint`, `npm run build`.

**Manual**

1. Seed an admin locally (see Deployment notes) → sign in as that account → `GET /platform/reports` returns `200` with any existing `ServerReport` rows.
2. Sign in as a non-admin demo user → `GET /platform/reports` → `403`.
3. As the admin, `POST /platform/reports/:id/delist` on an open report for a listed server → the server's `listed` becomes `false`, `GET /discovery/servers` no longer returns it, and `GET /servers/:serverId/audit-logs` for that server (as its owner) shows a `PLATFORM_REPORT_DELIST` entry.
4. Repeat the same `dismiss`/`delist` call on the now-resolved report → `409 Report is already resolved`.
5. Toggle the seeded admin's `platformRole` back to `USER` directly in the database while their session is still valid → their very next `/platform/*` call returns `403` without needing to sign out.
6. Web: sign in as the admin → the "Platform Admin" nav entry is visible; sign in as a non-admin → it is absent, and navigating to the route directly still gets `403` from the API (UI hiding is not the enforcement).

## Deployment Notes

- Run migration `20260918005000_add_platform_admin_reports` before deploying the API.
- **Local dev admin**: `apps/api/prisma/seed.ts` gains one explicit `prisma.user.upsert` for an `admin@example.com` account with `platformRole: 'ADMIN'` set directly in the seed's `create`/`update` data — consistent with "set only via DB/seed/script, never by any API," since the seed script is exactly that path and is never invoked by the running API. Anyone who needs a second local admin runs a one-off `prisma.user.update({ where: { email }, data: { platformRole: 'ADMIN' } })` via `npx prisma studio` or a short throwaway Node script against their own local database — not added as a checked-in script, since granting platform admin is rare enough that a documented one-liner is proportional; escalate to a real script if this needs to happen routinely in staging/production.
- New `platform.*` i18n keys land in both `en` and `vi` catalogs in the same change; run `npm run i18n:check`.
- No breaking change to existing endpoints; `/platform/*` is entirely new.
- Before this ships to production, an actual production admin account must be granted `platformRole: ADMIN` by a direct database write against production — never through this feature's own code, and never through a seed script run against production.

## Deviations

- **API/shared/seed scope only, this pass.** This implementation covers the API, `packages/shared` contract types, and the seed admin row. The `apps/web` admin page/section (`PlatformReportsPage.tsx`, `PlatformReportDetail.tsx`, `usePlatformReports.ts`, `en`/`vi` `platform.*` UI copy) is out of scope for this change — another agent is editing `apps/web` concurrently — and is listed as follow-up work for a subsequent change instead of being built here.
- `apps/api/src/modules/users/user-profile.ts`: the doc's Technical Approach names this file for adding `platformRole` to the "me" response shape. Implemented instead as an extra column in `UsersService.getMe`'s own `select`/return (`platformRole: true`, spread onto the returned view) rather than adding it to `PROFILE_USER_SELECT`/`toProfileView`, because that shared select and view are also used by `getProfile` (another user's public profile). Adding it there would have required a second change to explicitly strip it back out for `getProfile`; keeping it local to `getMe` gets the same "only on the caller's own response" guarantee with one change instead of two. `PublicUser` in `packages/shared/src/api-contract.ts` still `Omit`s `platformRole` as a second, defense-in-depth guard.
- `apps/api/src/app.module.ts`, `apps/api/src/common/request-user.ts`, `apps/api/src/modules/auth/jwt-auth.guard.ts`: not named individually in the doc's "Files touched" table but required by the approved design — `PlatformModule` needs registering in `app.module.ts`, and the "no second DB call" guard shape (the doc's own "Revised technical note") needs `RequestUser`/`JwtAuthGuard` to carry `platformRole`. No behavior beyond what the doc specifies.
