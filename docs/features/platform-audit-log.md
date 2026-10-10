# Platform Audit Log

- **Status**: implemented 2026-09-29 (migration not applied, manual test plan not run); see Deviations
- **Date**: 2026-09-29
- **Related**: `open-questions.md` (closes row 40), `server-ownership-lifecycle.md` (Changes → Delete,
  Risks & rollback), `platform-report-review.md` (Technical approach, Trade-offs)

Adds a platform-level audit table that survives the deletion of the thing it describes, closing
open question #40: `AuditLog` is server-scoped and cascades away with its server
(`apps/api/prisma/models/servers.prisma:203`, `server    Server   @relation(fields: [serverId],
references: [id], onDelete: Cascade)`), so `DELETE /servers/:serverId` leaves no durable trail once
the transaction commits — today only a `Logger.warn` on the API process
(`apps/api/src/modules/servers/server-ownership.service.ts:117-119`, "The server's own audit log
went with the cascade; this line is the only trace left (open question 40)").

## Goal

Give the platform-admin surface (`platform-report-review.md`) a durable record of the handful of
events that outlive the row they describe: a server being deleted, ownership changing hands, a
platform admin's own resolution of a report, and an account being deleted. Today none of these
survive reliably — the first is a log line only, the rest live in a table (`AuditLog`) that
disappears with the server.

Acceptance criteria:

- `PlatformAuditLog` rows for `SERVER_DELETE`, `SERVER_OWNERSHIP_TRANSFER`,
  `PLATFORM_REPORT_DISMISS`, `PLATFORM_REPORT_DELIST`, and `ACCOUNT_DELETION` exist and are queryable
  after the server, report's server, or account that generated them is gone.
- No row in the table can be resurrected into a working link back to a user's current, non-deleted
  personal data: the fields it stores are a point-in-time snapshot, not a live reference.
- `GET /platform/audit-logs` (admin-only, same guard as `/platform/reports`) lists rows, paginated,
  filterable by `action` and by a free-text `targetId`/`actorId` match.
- `npm run typecheck`, `npm run lint`, `npm run build` pass; `docs/features/open-questions.md` row
  40 is updated to point here.

## Scope

**In scope**

- New `PlatformAuditLog` model and migration.
- A `PlatformAuditService.record(...)` helper, called from the four write paths named above.
- `GET /platform/audit-logs` list endpoint and its DTO, reusing `PlatformAdminGuard`.
- A "Platform Audit Log" tab/section on the existing platform-admin page.
- Removing the `Logger.warn`-only fallback for server delete once the table exists.

**Out of scope**

- Replacing or changing the existing per-server `AuditLog` model, its cascade, or its own read
  endpoint (`GET /servers/:serverId/audit-logs`) — that table keeps recording server-scoped events
  for that server's own moderators exactly as it does today.
- A general activity feed, alerting, or export of this table.
- Retention/purge tooling (see Changes → Retention below for why none is added in v1).
- Any new platform-admin action beyond what already exists (`platform-report-review.md`'s dismiss
  and delist) or is already decided (`server-ownership-lifecycle.md`'s delete and transfer).
- Recording every account-deletion outcome (`OWNS_SERVERS`/`NOT_DUE`) — only a completed anonymization
  is recorded (see Changes, Rules item 5).

## Current behavior

- `AuditLog` is required-`serverId`, cascades with its `Server`
  (`apps/api/prisma/models/servers.prisma:195-208`, `server Server @relation(..., onDelete: Cascade)`
  at line 203). Its `actor` relation has no `onDelete` clause (`:204`), so the actor `User` row is
  never removed by this table.
- Existing writers of `AuditLog`, confirmed by grep across
  `apps/api/src/modules/servers/*.ts`: `server-moderation.service.ts` writes `MEMBER_KICK` (`:56`),
  `MEMBER_LEAVE` (`:82`), `MEMBER_TIMEOUT`/`MEMBER_TIMEOUT_CLEAR` (`:116,121`), `MEMBER_BAN` (`:183`),
  `MEMBER_UNBAN` (`:201`); `servers.service.ts` writes `SERVER_UPDATE` (`:197`),
  `MEMBER_NICKNAME_UPDATE`/`MEMBER_PROFILE_UPDATE` (`:253,259`), `INVITE_CREATE`/`INVITE_REVOKE`
  (`:304,343`); `server-ownership.service.ts` writes `SERVER_OWNERSHIP_TRANSFER`
  (`:64-72`, inside the transfer transaction) but explicitly skips writing anything for delete
  (`:117-119`); `platform-reports.service.ts` (grepped, not shown above but confirmed by
  `platform-report-review.md:57`) writes `PLATFORM_REPORT_DISMISS`/`PLATFORM_REPORT_DELIST` with
  `serverId = report.serverId`.
- `server-insights.service.ts:17-68` reads `AuditLog` for a per-server dashboard
  (`MEMBER_LEAVE`/`MEMBER_KICK`/`MEMBER_BAN` grouped by day) — an example of the existing table's
  intended read pattern (server-scoped, action-filtered, date-ranged), which this new table is not
  a replacement for.
- Account deletion never writes to `AuditLog` at all today: `AccountDeletionService.completeDeletion`
  (`apps/api/src/modules/users/account-deletion.service.ts:124-136`) only calls
  `this.logger.warn(...)` for the `OWNS_SERVERS` outcome (`:133`) and, on success, emits a realtime
  event (`:138-146`) with no persisted audit row anywhere — `platform-report-review.md`'s own
  Current Behavior section calls this out as a precedent: account deletion "chose the application
  logger over `AuditLog`... because logging to one arbitrary server's audit log would pollute every
  server's audit log with an unrelated account event" (`account-deletion-and-export.md` Trade-offs,
  cited in `platform-report-review.md:43`).
- `anonymizeAccount` (`apps/api/src/modules/users/account-anonymization.ts:29-56`) keeps the `User`
  row (required relations with no cascade — message author, audit actor, poll creator — still point
  at it, per the comment at `:27-28`) but overwrites `username` to `deleted-${userId}`,
  `displayName` to `DELETED_USER_DISPLAY_NAME` (`'Deleted User'`,
  `apps/api/src/modules/users/account-deletion.rules.ts:14`), `email`, and every profile field
  (`:47-56`). A **live join** from any audit table to `User` therefore shows "Deleted User" for an
  actor or a target whose account was later deleted, even though the row is not gone — this is the
  concrete reason a foreign-key-based actor/target reference is wrong here (see Changes → Data model).
- `PlatformAdminGuard` (`apps/api/src/modules/platform/platform-admin.guard.ts:1-21`) is a
  synchronous check on `request.user.platformRole`, already populated by `JwtAuthGuard`'s session
  load — no new guard is needed, this doc reuses it as-is.
- No `apps/api/prisma/models/platform*.prisma` file exists yet; `PlatformRole` lives in
  `apps/api/prisma/models/users.prisma:26-...` and `ServerReport` in
  `apps/api/prisma/models/discovery.prisma`.
- Migrations are hand-written SQL files under `apps/api/prisma/migrations/<timestamp>_<name>/`,
  most recent `20260925001000_add_decision_channels`
  (`apps/api/prisma/migrations/20260925001000_add_decision_channels/migration.sql`); every
  migration's SQL comment states its `down()` in a leading comment block (verified pattern in
  `20260918005000_add_platform_admin_reports/migration.sql` and the decision-channels migration
  above). The next free slot after `20260925001000` is **`20260925002000`** (checked
  `apps/api/prisma/migrations/`; no later timestamp exists, and no other doc's Deployment notes
  reserve `20260925002000`–`20260925999000`, grepped across `docs/features/*.md`).

## Changes

### Data model

New model `PlatformAuditLog`, in a new `apps/api/prisma/models/platform-audit.prisma`:

```prisma
enum PlatformAuditAction {
  SERVER_DELETE
  SERVER_OWNERSHIP_TRANSFER
  PLATFORM_REPORT_DISMISS
  PLATFORM_REPORT_DELIST
  ACCOUNT_DELETION
}

enum PlatformAuditTargetType {
  SERVER
  USER
  REPORT
}

model PlatformAuditLog {
  id                String                  @id @default(cuid())
  action            PlatformAuditAction
  actorId           String?
  actorUsername     String?
  actorDisplayName  String?
  targetType        PlatformAuditTargetType
  targetId          String
  targetName        String?
  metadata          Json?
  createdAt         DateTime                @default(now())

  @@index([action, createdAt])
  @@index([targetId])
  @@index([actorId])
}
```

- **No foreign key on `actorId` or `targetId`, deliberately.** `targetId` is a `Server.id` for
  `SERVER_DELETE`/`SERVER_OWNERSHIP_TRANSFER`, a `ServerReport.id` for the two report-resolution
  actions, or a `User.id` for `ACCOUNT_DELETION` — three different tables, so it cannot be one FK
  column at all (a nullable per-table FK trio would still break the moment the target row for
  `SERVER_DELETE` is deleted, since that row is exactly what disappears together with the server
  it belongs to — the same cascade this table exists to survive). A `Restrict` FK would block the
  very delete this table is meant to record; a `Cascade`/`SetNull` FK would either delete this row
  too (defeating the whole point) or silently blank the one column that says what was acted on.
  `targetId` is therefore a plain string, informational only, resolved by a human reading the row —
  not by a join the database enforces.
- **`actorId` also carries no FK, for a different reason: `User` rows are never hard-deleted**
  (`account-anonymization.ts:27-28`), so a FK to `User` would never break — but a **live join** would
  silently rewrite history. An admin who dismissed a report, or an owner who deleted their own
  server, and later deletes their own account, would have every past `PlatformAuditLog` row about
  them start rendering as "Deleted User" if the display relied on joining to the current `User` row.
  `actorUsername`/`actorDisplayName` are captured **at write time**, from the same pre-anonymization
  read `anonymizeAccount` already does for `avatarUrl`/`bannerUrl`
  (`account-anonymization.ts:41-45`, the `before` select) — extended to also select `username`,
  `displayName` — so the row keeps saying who actually did it, permanently, independent of what
  happens to that account afterward. `actorId` itself is kept (nullable, no FK) purely as a
  correlation key for a human operator who wants to check the account's current state; it is never
  used to render the row.
- **`targetName`** is the same idea for the target: `Server.name` at the moment of deletion (already
  read by `deleteServer` before the cascade, `server-ownership.service.ts:93-96` reads
  `server.avatarUrl` in the same `Promise.all` — extended to also select `name`), or the reported
  server's name for the two report-resolution actions, or the deleted account's pre-anonymization
  `displayName` for `ACCOUNT_DELETION`. Nullable because a future action type might not have one
  cleanly (kept optional rather than forcing a placeholder string).
- **PII stored**: `username` and `displayName` only — both are already shown to every other member
  of a shared server today (`ServerMember`, chat messages, the member list), and `rules/security.md`
  names them as an acceptable "who" for an auditable action ("For money, contracts, and permission
  logic: prioritize correctness and auditability over brevity. Log the action (who, what, when)").
  **Never stored**: email, password hash, phone, IP address, or any field from `dto.password`/`code`
  used for re-auth on transfer/delete. `metadata` (Json) follows the same rule the existing
  `AuditLog` writers already follow — e.g. `SERVER_OWNERSHIP_TRANSFER`'s existing metadata is
  `{ fromUserId, toUserId, toUsername }` (`server-ownership.service.ts:70`) — usernames and ids only,
  no email or secrets.
- **Account deletion interaction, explicitly**: once an account is anonymized, this table's own
  `actorUsername`/`actorDisplayName`/`targetName` snapshots for that account **do not change** — they
  keep showing the name as it was at the time of the logged action, which is the point of a durable
  audit trail. This is not "resurrecting" the deleted personal data: the row already existed before
  the deletion, and the snapshot is exactly the kind of historical fact an audit log is supposed to
  keep (the same principle `AuditLog`'s own untouched rows for a still-existing server already rely
  on — a kicked member's `username`/`displayName` are frozen into that row's `metadata` today,
  `server-moderation.service.ts:56-60`, and nobody argues that is a privacy bug). What must never
  happen is a **new** query result exposing anything beyond username/displayName for an anonymized
  account — enforced simply by never storing anything else in this table in the first place.
- **Retention**: kept indefinitely in v1, matching the existing `AuditLog` table, which also has no
  purge job (grepped `apps/api/src/modules` for `auditLog.deleteMany`/a sweep: none found). A
  retention/export policy is a separate decision affecting both tables together, out of scope here.
- **Indexes**: `(action, createdAt)` for the admin page's default "recent activity" view filtered by
  action type; `(targetId)` and `(actorId)` for "show me everything about this server/report/account"
  lookups, the two other query shapes the read surface needs (see API contract).

### Which events, and why (vs. what stays server-scoped only)

| Event                          | Written here                                                                                 | Also still written to server-scoped `AuditLog`?                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server delete                  | Yes — the only record of it (`server-ownership.service.ts:117-119` currently the only trace) | No — nothing to duplicate; the server-scoped row would be deleted in the same statement anyway (existing comment at `:117-118` explains why none is written there)                                                                   |
| Ownership transfer             | Yes — new                                                                                    | Yes, unchanged (`server-ownership.service.ts:64-72`) — that row is useful to that server's own moderators for as long as the server exists; duplicating here is what makes it survive if the server is _later_ deleted               |
| Platform report dismiss/delist | Yes — new                                                                                    | Yes, unchanged (`platform-reports.service.ts`, per `platform-report-review.md:57`) — same reasoning: the server-scoped copy serves that server's own `MANAGE_SERVER` holders today, the platform copy survives a later server delete |
| Account deletion (completed)   | Yes — new, first persisted record of this event at all                                       | N/A — never had one; see Current behavior                                                                                                                                                                                            |

Duplication for transfer/dismiss/delist is accepted, not incidental: the two tables serve different
readers (a server's own moderators vs. platform admins across all servers) and different lifetimes
(as long as the server exists vs. forever). Writing both costs one extra insert per action on a
low-traffic admin surface — the same trade this repo already made for
`PlatformReportsService`'s single `AuditLog` write today, just extended by one more insert.

### Rules / Flow

1. New `PlatformAuditService` (`apps/api/src/modules/platform/platform-audit.service.ts`), exported
   from `PlatformModule`, with one method:
   `record(action, { actorId, actorUsername, actorDisplayName, targetType, targetId, targetName, metadata })`.
   All fields except `action` and `targetType`/`targetId` are optional, so a caller that genuinely has
   no actor (there is none for this doc's events, but the shape allows it for a future system-initiated
   action) is not forced to invent one.
2. `ServerOwnershipService.deleteServer` (`server-ownership.service.ts:83-159`): after the conditional
   `deleteMany` succeeds (`:113-116`) and in place of the `Logger.warn` at `:119`, call
   `platformAudit.record('SERVER_DELETE', { actorId: userId, actorUsername, actorDisplayName,
targetType: 'SERVER', targetId: serverId, targetName: server.name })`, using
   `userId`'s username/displayName read alongside the existing `avatarUrl` read at `:93-96`
   (both already known: the caller is the current owner, whose row is not going anywhere) and the
   server's `name` read alongside its `avatarUrl` in the same query. The `Logger.warn` line stays as
   a same-process breadcrumb, not the record of truth.
3. `ServerOwnershipService.transferOwnership` (`:36-81`): inside the same transaction that writes the
   existing `AuditLog` row (`:64-72`), also call `platformAudit.record('SERVER_OWNERSHIP_TRANSFER',
{ actorId: userId, actorUsername: <old owner's username, already loaded by
requireOwner→permissions.requireMembership>, targetType: 'SERVER', targetId: serverId, targetName:
<server name>, metadata: { fromUserId: userId, toUserId: dto.userId, toUsername:
target.user.username } })`. Same metadata shape already used for the server-scoped row.
4. `PlatformReportsService.dismiss`/`.delist`: alongside the existing `AuditLog` write described in
   `platform-report-review.md:57`, also call `platformAudit.record('PLATFORM_REPORT_DISMISS' |
'PLATFORM_REPORT_DELIST', { actorId: admin.id, actorUsername: admin.username, actorDisplayName:
admin.displayName, targetType: 'REPORT', targetId: report.id, targetName: <reported server's
name, already fetched for the detail view>, metadata: { serverId: report.serverId } })`.
5. `AccountDeletionService.completeDeletion` (`:124-...`): only on the success path (`outcome.status`
   is neither `OWNS_SERVERS` nor `NOT_DUE`), call `platformAudit.record('ACCOUNT_DELETION', {
actorId: userId, actorUsername: <pre-anonymization username>, actorDisplayName: <pre-anonymization
displayName>, targetType: 'USER', targetId: userId, targetName: <pre-anonymization displayName> })`.
   `anonymizeAccount`'s existing `before` select (`account-anonymization.ts:41-45`) is extended to
   also select `username`/`displayName`, read **before** the `updateMany` overwrites them, and
   returned as part of `AnonymizedAccount` alongside `avatarUrl`/`bannerUrl` so the caller has them
   without a second query. `actorId` and `targetId` are the same value here — the account acted on
   itself — recorded as both fields for a consistent read shape across all five actions (every row
   has a `targetId`; only some also have a distinct `actorId`).
6. `GET /platform/audit-logs?action=&targetId=&actorId=&cursor=`: same keyset-cursor pagination
   pattern as `GET /platform/reports` (`platform-report-review.md:52`, `<createdAt>_<id>` cursor),
   same page-size cap (`PLATFORM_REPORTS_PAGE_SIZE = 50`,
   `packages/shared/src/api-contract.ts:904`, reused as `PLATFORM_AUDIT_LOGS_PAGE_SIZE` with the same
   value rather than inventing a different cap for a sibling admin list).

### Edge cases

| Case                                                                                                                                                     | Expected behavior                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server deleted, then its `PlatformAuditLog` rows queried                                                                                                 | Return normally — nothing in this table references the deleted `Server` row, so there is nothing to break                                                                                                        |
| Account anonymized after being an actor in several rows                                                                                                  | Every existing row keeps its pre-anonymization `actorUsername`/`actorDisplayName` snapshot unchanged; a fresh action by the now-anonymized account cannot happen (their session was revoked as part of deletion) |
| `targetId` filter for a report that was itself later deleted (cannot actually happen — `ServerReport` cascades with its `Server`, `discovery.prisma:41`) | The `PlatformAuditLog` rows about that report still return; `targetId` simply cannot be resolved back to a live `ServerReport` row via a join the reader does not attempt anyway                                 |
| Non-admin calls `GET /platform/audit-logs`                                                                                                               | `403`, same `PlatformAdminGuard` behavior as `/platform/reports`                                                                                                                                                 |
| Empty result set                                                                                                                                         | `{ logs: [], nextCursor: null }`, `200`                                                                                                                                                                          |
| `actorId`/`targetId` filter with no matches                                                                                                              | `{ logs: [], nextCursor: null }`, `200` — not a `404`, matching `GET /platform/reports`'s own empty-list behavior                                                                                                |

## Technical approach

**Files touched**

| File                                                                      | Change                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/models/platform-audit.prisma`                            | New — `PlatformAuditLog` model, `PlatformAuditAction`, `PlatformAuditTargetType` enums.                                                                                                                 |
| `apps/api/prisma/migrations/20260925002000_add_platform_audit_log/`       | New hand-written migration.                                                                                                                                                                             |
| `apps/api/src/modules/platform/platform-audit.service.ts`                 | New — `record(...)`, thin wrapper over `prisma.platformAuditLog.create`.                                                                                                                                |
| `apps/api/src/modules/platform/platform-audit-logs.service.ts`            | New — `list(query)` for the read side, mirroring `platform-reports.service.ts`'s cursor pattern.                                                                                                        |
| `apps/api/src/modules/platform/platform-audit-logs.controller.ts`         | New — `@UseGuards(JwtAuthGuard, PlatformAdminGuard)`, `GET /platform/audit-logs`.                                                                                                                       |
| `apps/api/src/modules/platform/dto/list-platform-audit-logs-query.dto.ts` | New DTO — `action?`, `targetId?`, `actorId?`, `cursor?`.                                                                                                                                                |
| `apps/api/src/modules/platform/platform.module.ts`                        | Export `PlatformAuditService`; register the two new providers/controller.                                                                                                                               |
| `apps/api/src/modules/servers/server-ownership.service.ts`                | Inject `PlatformAuditService`; call `record('SERVER_DELETE', ...)` and `record('SERVER_OWNERSHIP_TRANSFER', ...)`; extend the existing pre-cascade reads to also fetch `name`/`username`/`displayName`. |
| `apps/api/src/modules/servers/servers.module.ts`                          | Import `PlatformModule` so `ServerOwnershipService` can inject `PlatformAuditService`.                                                                                                                  |
| `apps/api/src/modules/platform/platform-reports.service.ts`               | Inject `PlatformAuditService`; call `record(...)` alongside the existing `AuditLog` write in `dismiss`/`delist`.                                                                                        |
| `apps/api/src/modules/users/account-anonymization.ts`                     | Extend the `before` select to include `username`, `displayName`; add them to `AnonymizedAccount`.                                                                                                       |
| `apps/api/src/modules/users/account-deletion.service.ts`                  | Inject `PlatformAuditService`; call `record('ACCOUNT_DELETION', ...)` on the success path of `completeDeletion`.                                                                                        |
| `apps/api/src/modules/users/users.module.ts`                              | Import `PlatformModule`.                                                                                                                                                                                |
| `packages/shared/src/api-contract.ts`                                     | `PlatformAuditAction`, `PlatformAuditTargetType`, `PlatformAuditLogView`, `PlatformAuditLogPage`, `PLATFORM_AUDIT_LOGS_PAGE_SIZE`.                                                                      |
| `apps/web/src/api.ts`, `apps/web/src/hooks/usePlatformAuditLogs.ts`       | New — fetch the list.                                                                                                                                                                                   |
| `apps/web/src/components/platform/PlatformAuditLogPage.tsx`               | New — a second tab/section inside the existing `PlatformReportsPage.tsx` dialog (see Trade-offs), reusing `Badge`/`TextField`/pagination patterns from `PlatformReportsPage.tsx:1-50`.                  |
| `apps/web/src/i18n/locales/{en,vi}/platform.ts`                           | New `platform.auditLog.*` keys.                                                                                                                                                                         |

**API contract**

- `GET /platform/audit-logs`
  - Query: `action?: PlatformAuditAction, targetId?: string, actorId?: string, cursor?: string`
  - Response `200`: `{ logs: PlatformAuditLogView[], nextCursor?: string }`
  - `PlatformAuditLogView`: `{ id, action, actorId, actorUsername, actorDisplayName, targetType, targetId, targetName, metadata, createdAt }`
  - Errors: `401` no/invalid session · `403` not `platformRole: ADMIN`

**DB / migration**

- New table `PlatformAuditLog` (columns and indexes as in Data model above) — no existing table is
  altered, so there is no lock-duration concern on any populated table.
- Migration name: `20260925002000_add_platform_audit_log` — next free slot after
  `20260925001000_add_decision_channels`.
- Hand-written SQL sketch (down() stated in the leading comment, matching this repo's own convention,
  e.g. `20260918005000_add_platform_admin_reports/migration.sql`):

```sql
-- Platform audit log (docs/features/platform-audit-log.md). New table only; no existing column,
-- index, or constraint is touched. Empty at creation, so no lock-duration concern.
--
-- down():
--   DROP TABLE "PlatformAuditLog";
--   DROP TYPE "PlatformAuditTargetType";
--   DROP TYPE "PlatformAuditAction";
--   Dropping the table is data-destroying for every row recorded before rollback; there is no
--   application-level backup of this table's contents beyond a database snapshot.

CREATE TYPE "PlatformAuditAction" AS ENUM (
  'SERVER_DELETE',
  'SERVER_OWNERSHIP_TRANSFER',
  'PLATFORM_REPORT_DISMISS',
  'PLATFORM_REPORT_DELIST',
  'ACCOUNT_DELETION'
);

CREATE TYPE "PlatformAuditTargetType" AS ENUM ('SERVER', 'USER', 'REPORT');

CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "action" "PlatformAuditAction" NOT NULL,
    "actorId" TEXT,
    "actorUsername" TEXT,
    "actorDisplayName" TEXT,
    "targetType" "PlatformAuditTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");
CREATE INDEX "PlatformAuditLog_targetId_idx" ON "PlatformAuditLog"("targetId");
CREATE INDEX "PlatformAuditLog_actorId_idx" ON "PlatformAuditLog"("actorId");
```

No FK constraints are added on `actorId` or `targetId`, deliberately (see Data model).

**Libraries** — none new; reuses `class-validator` DTOs and the existing `PrismaService` pattern.

## Trade-offs

| Option                                                                                      | Pros                                                                                                  | Cons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Verdict                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New standalone `PlatformAuditLog` table with snapshot-only actor/target fields (chosen)** | Survives any cascade; no FK to defend against; matches the exact ask in open question #40             | A second insert alongside the existing `AuditLog` write for transfer/dismiss/delist (see Duplication note); one more table to keep in sync by convention (a future platform action must remember to call `record(...)`)                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Chosen — it is the only option that actually satisfies "survives the deletion of the thing it describes," which a server-scoped table structurally cannot                  |
| Detach `AuditLog` from the server: make `serverId` nullable, drop its `onDelete: Cascade`   | Reuses one table instead of two; `server-insights.service.ts`'s existing reads keep working unchanged | `AuditLog.server` is a required relation read by every other writer (kick, ban, timeout, invite, `SERVER_UPDATE`, ...) via `serverId` — making it nullable and non-cascading would leave every past row for a deleted server permanently in the table with a dangling `serverId` that no longer resolves, still with no `username`/`displayName` snapshot for its `actorId` (today's rows rely on a live join to `User` for the actor's current name in some reads, and rely on `metadata` only for others) — fixing that requires the same actor-snapshot work this doc already does, on top of migrating every existing writer's assumption that `serverId` is always present | Ruled out — it is a bigger, riskier change to a table nine other writers already depend on, to solve a problem that only a handful of platform-level actions actually have |
| Accept a log-line only (status quo, extended to the other four events)                      | Zero schema change, zero migration risk                                                               | Exactly the gap open question #40 is asking to close: nothing durable, unqueryable, invisible to the platform-admin page, lost on a process restart before anyone reads the log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ruled out — does not solve the stated problem, only documents it further                                                                                                   |
| FK `actorId`/`targetId` to `User`/`Server` with `onDelete: SetNull`                         | Standard relational integrity; a live join is "free" until the referenced row is gone                 | `targetId` for `SERVER_DELETE` would go straight to `NULL` the instant the server that generated the row is deleted — deleting the one identifying fact (which server) from the row whose entire purpose is to say which server was deleted; a three-way polymorphic target (`Server`/`ServerReport`/`User`) also cannot be one FK column at all                                                                                                                                                                                                                                                                                                                                | Ruled out — SetNull on the target erases exactly the information this table exists to keep; explained fully in Data model                                                  |

What the chosen option costs: one new table with no automated purge (accepted, matches `AuditLog`'s
own precedent); a small amount of duplicated data between `AuditLog` and `PlatformAuditLog` for
transfer/dismiss/delist (accepted, different readers and lifetimes — see Changes); every future
platform-level, cross-cutting event needs a deliberate `PlatformAuditService.record(...)` call added
by hand — there is no mechanism that catches a missing one (same limitation the existing `AuditLog`
writers already have, and not solved here).

## Risks & rollback

- **What can break**: none of the five write sites' existing behavior changes — this only adds one
  more insert (and, for delete/account-deletion, one extra `SELECT` of a few columns already read in
  the same query) to each. A `PlatformAuditService.record` failure inside the `transferOwnership`/
  `dismiss`/`delist` transactions would roll back the whole action (consistent with how a thrown
  exception already rolls back any transaction in this codebase, `rules/backend-nestjs.md`
  Transactions); for `deleteServer` and `completeDeletion`, the `record` call happens **after** the
  server-delete/anonymization transaction has already committed (matching how the existing
  `Logger.warn`/realtime-emit steps already run post-commit in both services), so a failure there
  logs an error but does not undo the delete/anonymization — the trade-off is a possible missing
  audit row for a delete/deletion that still genuinely happened, not a silently-failed delete.
- **Not covered**: retention/export policy for either audit table; a UI or API to search across both
  `AuditLog` and `PlatformAuditLog` in one view (kept as two separate reads, matching two separate
  audiences); recording report-review actions that are not dismiss/delist (there are none today).
- **Rollback**: revert the code; the migration's `down()` drops the new table and enums — this is
  data-destroying for every row recorded before rollback (stated in the migration's own comment) and
  has no application-level backup beyond a database snapshot, same as any other hard-delete rollback
  in this codebase's migration history.

## Test plan

The repository keeps no automated tests (`RULE.md:77`, "Do not create automated test files...
Verify changes with typecheck, lint, build, and a written manual verification scenario"). Verify
with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`.

**Manual**

1. As a server owner, `DELETE /servers/:serverId` (with valid re-auth) → `200`; query
   `GET /platform/audit-logs?action=SERVER_DELETE` as a platform admin → one new row with the
   correct `targetId` (the now-deleted server's id), `targetName` (its former name), and the owner's
   `actorUsername`/`actorDisplayName`.
2. As an owner, `POST /servers/:serverId/transfer` to another member → `200`; confirm both
   `GET /servers/:serverId/audit-logs` (server-scoped, as before) **and**
   `GET /platform/audit-logs?action=SERVER_OWNERSHIP_TRANSFER` show the transfer, with matching
   `fromUserId`/`toUserId` in each.
3. As a platform admin, `POST /platform/reports/:id/delist` → confirm both the existing
   `PLATFORM_REPORT_DELIST` row in that server's `AuditLog` and a new
   `GET /platform/audit-logs?action=PLATFORM_REPORT_DELIST` row exist.
4. Schedule an account for deletion, let the sweep complete it (or trigger `completeDeletion`
   directly in a local run) → `GET /platform/audit-logs?action=ACCOUNT_DELETION` shows one row with
   the account's pre-anonymization `username`/`displayName`, while `GET /users/:id` (if such a lookup
   exists) or the anonymized `User` row itself now shows `deleted-<id>`/`Deleted User` — confirming
   the snapshot is frozen and does not track the live (now-anonymized) row.
5. Non-admin calls `GET /platform/audit-logs` → `403`.
6. `GET /platform/audit-logs?targetId=<id that never appears>` → `{ logs: [], nextCursor: null }`,
   `200`.
7. Web: the platform-admin dialog's new "Audit Log" tab lists rows, filterable by action, for the
   admin; absent (and the route still `403`s) for a non-admin.

## Deployment notes

- Run migration `20260925002000_add_platform_audit_log` before deploying the API — it only creates a
  new table and two new enums, no lock on an existing table.
- No new env vars.
- No cache/queue to clear.
- `overview.md` for the `platform` menu does not exist yet (only this doc and
  `platform-report-review.md` do, both flat under `docs/features/`) — not created here, per
  `rules/documentation.md`'s rule that a flat file is promoted to `<menu>/overview.md` only "as soon
  as a second doc for the same menu appears." Two docs now exist for the same
  concern (`platform-report-review.md`, this doc); flagged to the user rather than done
  unilaterally, since promoting/moving files is a structural decision this doc should not make on
  its own.
- Breaking API change: none — `/platform/audit-logs` is entirely new.

## Deviations

Found during implementation; behavior still matches every acceptance criterion above.

- **`transferOwnership`'s actor snapshot is one extra `User` select, not a free ride on
  `requireOwner`.** The doc assumed the old owner's `username`/`displayName` were "already loaded by
  `requireOwner`→`permissions.requireMembership`" (Rules/Flow item 3), but that call returns the
  `ServerMember` row without a `user` relation
  (`apps/api/src/modules/permissions/permissions.service.ts:20-31` — `include: { roles: { include: {
role: true } } }`, no `user`). Implemented as one additional `prisma.user.findUniqueOrThrow`
  (`username`, `displayName` only) run in parallel with the existing server-name read, before the
  transaction — same cost class as the extra reads already accepted for `deleteServer`/
  `completeDeletion` in Risks & rollback.
- **`PlatformReportsService.resolve`'s actor snapshot is also one extra `User` select, not from
  `RequestUser`.** The doc assumed `admin.username`/`admin.displayName` were both available on the
  caller (Rules/Flow item 4), but `RequestUser` (`apps/api/src/common/request-user.ts`) carries
  `username` and not `displayName`. Implemented as one additional `tx.user.findUniqueOrThrow`
  (`username`, `displayName`) inside the same transaction as the existing `AuditLog`/report-update
  writes, so a failure there still rolls back the whole resolve action like every other write in it.
- **`targetName` for `PLATFORM_REPORT_DISMISS`/`DELIST` comes from the existing report's `server`
  relation, not a separate "detail view" fetch.** The doc said the reported server's name was
  "already fetched for the detail view" (Rules/Flow item 4), but `resolve()` never calls `detail()`
  and, before this change, only fetched the server row at all on the `SERVER_DELISTED` branch.
  Implemented by adding `server: { select: { name: true } }` to the existing `existing` select at the
  top of `resolve()`'s transaction — a joined column on a query already running, not a new query — so
  `targetName` is populated for both `DISMISSED` and `SERVER_DELISTED`.
- **Post-commit `platformAudit.record` calls (`SERVER_DELETE`, `ACCOUNT_DELETION`) are wrapped in
  `try`/`catch`, logged via `Logger.error` on failure, and never rethrown.** The doc's Risks &
  rollback section states a failure there "logs an error but does not undo the delete/anonymization,"
  which requires the call to not propagate — made explicit in code rather than left implicit, since
  an uncaught throw after `deleteMany`/`anonymizeAccount` already committed would otherwise surface
  as a `500` for a delete/deletion that actually succeeded.
