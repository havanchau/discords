# Feature Spec: Message Reports

Lets a member flag a message or a user for moderator attention, and gives server moderators a queue to work through those flags.

## Goal

Any member of a server can report a channel message (or a user, with an optional message reference) to that server's moderators; a moderator triages the report to resolved or dismissed.

Acceptance criteria:

- `POST /servers/:serverId/reports` creates a report for a message or a user in that server, requires membership, and is rate-limited per reporter.
- `GET /servers/:serverId/reports` lists reports for moderators only, newest first, filterable by status.
- `PATCH /servers/:serverId/reports/:reportId` transitions `OPEN → RESOLVED` or `OPEN → DISMISSED`, requires `MANAGE_MESSAGES`, and is audited.
- A member without `MANAGE_MESSAGES` gets `403` from the list and the transition endpoints.
- Reporting a message the reporter cannot read (wrong channel/server) returns `404`.
- Reporting the same message twice by the same reporter is idempotent (returns the existing open report) rather than creating a duplicate.

## Scope

- **In scope**: `MessageReport` model, report/list/resolve endpoints, moderator queue UI in server settings, a "Report message" action next to the existing message actions, rate limiting, audit logging.
- **Out of scope**: reporting direct messages (see Open Questions), a cross-server or platform-level queue, automatic action on report volume (that is AutoMod's job, see `docs/features/automod.md`), notifying the reported user, appeals.

## Current Behavior

- Message moderation today is delete-only: `MessagesService.deleteMessage` allows the author or anyone with `MANAGE_MESSAGES` (`apps/api/src/modules/messages/messages.service.ts:404-433`), checked via `PermissionsService.hasServerPermission` (`apps/api/src/modules/permissions/permissions.service.ts:46`).
- There is no report, flag, or queue concept anywhere in `apps/api/prisma/schema.prisma`.
- The web client's per-message action menu (delete, pin, reply, react) lives alongside `useChannelMessageActions.ts`, introduced to keep channel message actions out of `AppShell.tsx` (`docs/features/member-timeout-and-slowmode.md`); it has no report action today.
- Server settings already has a moderator-only, `MANAGE_MESSAGES`/permission-gated section pattern in `ServerBansSection.tsx` (list + action button, loading/empty/error states) that a report queue can follow.
- Rate limiting for server-scoped write endpoints goes through `RedisFixedWindowLimiter` (`apps/api/src/common/redis-fixed-window-limiter.ts:25`), used per-instance-safe because the counter lives in Redis, not process memory.

## Changes

### Rules

- `targetType`: `MESSAGE` or `USER`. `MESSAGE` reports require `messageId` (must belong to the given server and not already be `deletedAt`-marked); `USER` reports require `targetUserId` (must be a current member of the server) and may optionally include `messageId` for context.
- `reason` is required, one of a fixed enum (`SPAM`, `HARASSMENT`, `NSFW`, `HATE_SPEECH`, `OTHER`); `details` is optional free text up to 500 characters.
- A reporter must be a member of the server and able to read the channel the message is in (`requireReadableChannel`, mirroring `MessagesService.createMessage`, `apps/api/src/modules/messages/messages.service.ts:164`).
- A reporter cannot report their own message or themselves as a `USER` target (`400`).
- Re-reporting the same `(reporterId, messageId)` or `(reporterId, targetUserId)` pair while an existing report is still `OPEN` returns the existing report (`200`) instead of creating a duplicate; a new report can be filed again once the prior one is `RESOLVED` or `DISMISSED`. The check is a read before the insert (Prisma cannot model a partial unique index on `status = OPEN`), so two simultaneous first reports can both be stored; the cost is one duplicate queue row.
- For a `MESSAGE` report, `targetUserId` is set to the message author, so the queue still names who was reported after the message is gone.
- Any miss on the message — unknown id, another server's message, a deleted message, or a channel the reporter cannot view — answers `404 Message not found`, so the endpoint does not reveal messages in channels the reporter cannot see. A non-member gets `403` from the membership check, as elsewhere. A `USER` target that is not a current member answers `404 Member not found`. A missing `messageId` / `targetUserId` for the chosen `targetType` is a `400` validation error.
- Rate limit: 10 reports per reporter per 10 minutes per server, enforced through `RedisFixedWindowLimiter`, returning `429` with the standard retry-after shape used elsewhere. The `@RateLimit` decorator keys by client IP, so the create handler calls the limiter itself with the key `message-report:<serverId>:<userId>`, sets `Retry-After`, and throws the same `Rate limit exceeded. Retry after Ns.` literal as `RateLimitGuard`. That literal gains the `RATE_LIMIT_EXCEEDED` prefix code in `common/i18n/error-codes.ts`, which also translates the guard's existing `429` message.
- Listing and resolving require `MANAGE_MESSAGES` on that server (same permission `deleteMessage` already uses); an actor cannot resolve a report they filed themselves without also holding the permission — no exception for the reporter.
- Status transitions: `OPEN → RESOLVED` or `OPEN → DISMISSED` only; transitioning an already-closed report returns `409 Report is already resolved` / `409 Report is already dismissed`.
- Audit: `MESSAGE_REPORT_CREATE` `{ reportId, targetType, reason }` (actor is the reporter), `MESSAGE_REPORT_RESOLVE` / `MESSAGE_REPORT_DISMISS` `{ reportId }` (actor is the moderator).

### Client

- A channel message row gains "Report message" in both the hover action bar and the context menu, for messages the viewer did not write, opening `ReportMessageDialog` (reason buttons, optional details). It follows the self-contained Forward pattern in `MessageRow.tsx` (row state plus a dialog that owns its mutation) rather than `useChannelMessageActions.ts`, so no new prop is threaded through `AppShell.tsx`. The app renders no toasts anywhere today, so the dialog itself switches to a confirmation — "Report sent" or "already reported" — using the `created` flag of the response.
- The client offers message reports only; `USER` reports are available through the API.
- Server settings gains a "Reports" section, visible only to members with `MANAGE_MESSAGES` (UI gating, `docs/features/i18n-localization.md`-style permission check pattern used by `ServerBansSection.tsx`): a filterable list (status tabs Open/Resolved/Dismissed) showing reason, reporter, target message/user preview, date, and Resolve/Dismiss buttons on open reports; loading, empty, and error states. Unlike the bans section it reads its data through its own React Query hook instead of props from `SettingsModalFields`, again to keep `AppShell.tsx` unchanged. A deleted message shows "Message no longer available"; an end-to-end encrypted message shows "Encrypted message" instead of ciphertext.
- New strings (reason labels, form, queue) go into `apps/web/src/i18n/locales/en.ts` and `vi.ts`.

## Technical Approach

### Data model

```prisma
enum MessageReportTargetType {
  MESSAGE
  USER
}

enum MessageReportReason {
  SPAM
  HARASSMENT
  NSFW
  HATE_SPEECH
  OTHER
}

enum MessageReportStatus {
  OPEN
  RESOLVED
  DISMISSED
}

model MessageReport {
  id           String                   @id @default(cuid())
  serverId     String
  reporterId   String
  targetType   MessageReportTargetType
  messageId    String?
  targetUserId String?
  reason       MessageReportReason
  details      String?
  status       MessageReportStatus      @default(OPEN)
  resolvedById String?
  resolvedAt   DateTime?
  createdAt    DateTime                 @default(now())
  server       Server  @relation(fields: [serverId], references: [id], onDelete: Cascade)
  reporter     User    @relation("MessageReportReporter", fields: [reporterId], references: [id], onDelete: Cascade)
  message      Message? @relation(fields: [messageId], references: [id], onDelete: SetNull)
  targetUser   User?    @relation("MessageReportTarget", fields: [targetUserId], references: [id], onDelete: SetNull)
  resolvedBy   User?    @relation("MessageReportResolver", fields: [resolvedById], references: [id], onDelete: SetNull)

  @@index([serverId, status, createdAt])
  @@index([reporterId, messageId, status])
}
```

Migration `20260917005000_add_message_reports` (the `20260917002000` slot this spec first named is taken by `add_message_forwarding`).

### API

| Method  | Path                                   | Body                                                          | Response                                                                              | Rate limit |
| ------- | -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| `POST`  | `/servers/:serverId/reports`           | `{ targetType, messageId?, targetUserId?, reason, details? }` | `201 { report, created: true }` (or `200 { report, created: false }` if already open) | 10/10min   |
| `GET`   | `/servers/:serverId/reports`           | query `?status=OPEN\|RESOLVED\|DISMISSED` (omitted: all)      | `{ reports: MessageReportView[] }` (max 100)                                          | default    |
| `PATCH` | `/servers/:serverId/reports/:reportId` | `{ status: 'RESOLVED' \| 'DISMISSED' }`                       | `{ report }`                                                                          | 20/min     |

`MessageReportView`: `{ id, targetType, reason, details, status, createdAt, reporter: { id, displayName, avatarUrl }, message: { id, content, channelId, authorId } | null, targetUser: { id, displayName } | null, resolvedBy: { id, displayName } | null, resolvedAt }`.

### Realtime

- No new socket event in this slice: the queue is pull-based, refetched on open and after a mutation, matching the "handle reconnects by refetching" rule (`RULE.md`); a future increment could add `server:report-created` to `server:<id>` for moderators only if live badges are needed.

### Files

- API: `modules/reports/reports.module.ts`, `reports.controller.ts`, `reports.service.ts`, `dto/create-report.dto.ts`, `dto/update-report.dto.ts`, `dto/list-reports-query.dto.ts`, `app.module.ts` wiring, `common/i18n/error-codes.ts` and both API locales, `prisma/schema.prisma`, migration.
- Shared: `MessageReportView`, `CreateMessageReportInput`, `CreateMessageReportResult`, `UpdateMessageReportInput`, and the `messageReportReasons` / `messageReportStatuses` tuples in `packages/shared/src/api-contract.ts`.
- Web: `api.ts`, `query/queryKeys.ts`, `hooks/useMessageReports.ts`, `components/chat/MessageRow.tsx` (add "Report message"), `components/chat/ReportMessageDialog.tsx`, `components/settings/ReportsSection.tsx`, `ServerSettings.tsx`, `i18n/locales/en.ts`, `vi.ts`.

## Trade-offs

- **Per-server queue vs. a platform-wide moderation queue**: the codebase has no platform-admin role or cross-server permission concept (`packages/shared/src/permissions.ts` only defines server-scoped permissions), so a global queue would need a new authorization model out of scope here; server moderators handling their own server's reports fits the existing `MANAGE_MESSAGES` boundary.
- **`MANAGE_MESSAGES` vs. a new `REVIEW_REPORTS` permission**: same reasoning as `docs/features/member-bans.md`'s ban-permission choice — existing moderator roles already hold `MANAGE_MESSAGES` for message moderation, and a new permission would silently exclude them until reconfigured. Cost: cannot grant "review reports" without also granting "delete any message".
- **Idempotent re-report vs. allowing duplicates**: a queue full of duplicate open reports for the same viral message would bury distinct reports; collapsing to one open report per (reporter, target) keeps the queue meaningful at the cost of not surfacing "12 people reported this" as a count in this slice (the queue only shows one row).
- **Pull-based queue vs. realtime push**: avoids adding a new room/event before there is a UI badge to justify it; the queue is not a chat surface, so a few seconds of staleness after a manual refresh is acceptable, unlike message delivery.

## Risks & Rollback

- **Risk**: a message can be deleted after being reported; `messageId` is `onDelete: SetNull` so the report survives with `message: null` and the queue must render a "message no longer available" state.
- **Risk**: `MANAGE_MESSAGES` holders can see reports about their own moderation targets with no separation of duties; acceptable at this scale, matching the rest of the repo's flat moderator model (`docs/features/member-bans.md` Trade-offs, "no role hierarchy").
- **Rollback**: revert code; the migration is additive.

## Test Plan

- **Manual**: member reports a message for `SPAM` → moderator sees it in the Open tab with reason and message preview → clicks Resolve → it moves to the Resolved tab and disappears from Open.
- **Manual**: the same member reports the same message again while the report is still open → no second row appears in the queue.
- **Manual**: a member without `MANAGE_MESSAGES` opens server settings → no "Reports" section is visible, and `GET /servers/:serverId/reports` returns `403` if called directly.
- **Failure case**: reporter submits 11 reports inside 10 minutes → the 11th returns `429` with a retry-after value.

## Deployment Notes

- Run migration `20260917005000_add_message_reports` before deploying the API.
- Add the new report-flow strings to `en.ts` and `vi.ts` and run `npm run i18n:check`.

## Open Questions

See `docs/features/open-questions.md` for the DM-report reviewer question this doc could not resolve from the code (no platform-admin role exists to review reports on direct messages, which have no server-scoped moderator).
