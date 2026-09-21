# Feature Spec: Message Edit History

Keeps a message's prior text when it is edited, so a moderator working a report (or the author) can see what a message said before the edit that made it a moderation problem — or before it was fixed.

- **Status**: implemented 2026-09-21; see Deviations From The Original Design
- **Date**: 2026-09-18
- **Related**: `docs/features/message-reports.md`, `docs/features/automod.md` (AutoMod-on-edit), `docs/features/platform-report-review.md`

## Goal

Today an edit overwrites `Message.content`/`DirectMessage.content` in place and only records the timestamp of the last edit (`editedAt`) — the previous wording is gone. This is a live gap in the report queue: `ReportsService.list` reads the message's _current_ content at query time (`apps/api/src/modules/reports/reports.service.ts:19-30`, the `reportSelect.message` select has no content snapshot taken at report-creation time either — `apps/api/src/modules/reports/reports.service.ts:87-97`), so a member who edits a reported message after filing removes the moderator's only view of what was actually reported.

Acceptance criteria:

- Editing a channel message stores the content it is replacing as a revision, before the new content is written.
- `GET /servers/:serverId/reports/:reportId/message-history` (moderator-only) returns the revision list for the message tied to that report, so a moderator can see what a reported message said at each edit, including the version that no longer matches the live content.
- The message's own author can view their own message's edit history from the message itself, not only through a report.
- A `MANAGE_MESSAGES` moderator listing a report still gets the redacted/`contentHidden` behavior from `message-reports.md` when they cannot view the channel — history is gated the same way.
- Deleting a message removes its revisions along with it (no orphaned revision rows visible after delete).
- A caller with neither authorship nor `MANAGE_MESSAGES` gets `403`/`404` per the existing pattern, never sees another user's edit history.

## Scope

**In scope**

- A `MessageRevision` table capturing prior `content` for channel messages (`Message`), written on every edit before the new content lands.
- An endpoint for a moderator to view revisions of a message referenced by a `MessageReport`.
- An endpoint for the author to view their own message's revisions (channel messages only).
- Retention cap so the table cannot grow unbounded per message.
- Revisions deleted along with the message (soft-delete already wipes `content` to `''` — revisions must not keep it recoverable).
- Revisions for the account's own messages included in the account data export, and explicitly deleted (not anonymized) when the account is deleted — see Changes and Technical approach for the deletion mechanism.
- Web UI: "Edit history" entry in the message's existing action menu, and a matching entry on each report row in the moderator queue's `ReportsSection.tsx`, both opening a read-only dialog.

**Out of scope**

- Direct message edit history. `DirectMessage` has no `MANAGE_MESSAGES`-style moderator and no report/queue concept (`docs/features/message-reports.md` Out of scope: "reporting direct messages"; DMs are two-party and unmoderated by any server role) — there is no reviewer for DM revisions, and adding them would be a UI-only feature with no moderation payoff. If a follow-up wants it, the shape is the same table with a `directMessageId` column added later.
- A platform-admin-level view. `docs/features/platform-report-review.md` scopes platform admin review to `ServerReport` (public-discovery reports on a _server_) and explicitly keeps `MessageReport` review on the server's own `MANAGE_MESSAGES` moderators (`platform-report-review.md` Out of scope: "Reviewing `MessageReport` … this doc's queue is for `ServerReport` only"). So "platform reviewers" for message content do not exist in this codebase; this doc only serves server moderators and the author.
- A diff/highlight view between revisions — the dialog lists each past version in order, plain text, no word-level diffing.
- Restoring/reverting to a prior revision (view-only history, no "restore" action).
- Thread-root messages, forwarded-message snapshots, and poll messages: poll messages are already immutable and rejected from `updateMessage` (`apps/api/src/modules/messages/messages.service.ts:410-413`), so they never produce a revision.
- Any change to AutoMod's own edit-time scan (`enforceAutoMod` at `messages.service.ts:416-421`) — it keeps scanning the _new_ content only; revisions are a read-side history feature, not part of the moderation decision.

## Current behavior

- `Message.editedAt DateTime?` (`apps/api/prisma/models/messages.prisma:62`) and `DirectMessage.editedAt DateTime?` (`apps/api/prisma/models/direct-messages.prisma:39`) are the only edit markers; neither model stores prior content.
- `MessagesService.updateMessage` (`apps/api/src/modules/messages/messages.service.ts:396-439`): loads the message, requires the caller to be the author (`:405-407`), runs AutoMod against the new content (`:416-421`), then does a single `prisma.message.update` that overwrites `content` and sets `editedAt: new Date()` (`:423-430`) — the old `content` value is read into memory (`message.content`, from the `findUnique` at `:397-400`) but never persisted anywhere.
- `DirectMessageActionsService.updateMessage` (`apps/api/src/modules/direct-messages/direct-message-actions.service.ts:38-57`) follows the same shape for DMs: `content, editedAt: new Date()` overwrite (`:52-55`), no history kept.
- `MessagesService.deleteMessage` (`:441-474`) soft-deletes by setting `content: ''` and `deletedAt` — the pre-delete content is likewise not preserved anywhere once this runs.
- `ReportsService`'s `reportSelect` (`apps/api/src/modules/reports/reports.service.ts:19-30`) selects `message: { select: { id, content, channelId, authorId, deletedAt } }` — a plain relation select, re-read live on every `list()` call (`:120-138`), not a snapshot taken when the report was filed. `create()` (`:52-116`) stores no copy of `message.content` on the `MessageReport` row itself (`apps/api/prisma/models/moderation.prisma:23-44` has no content column).
- `ReportsService.list` redacts content the moderator cannot view: `viewableByChannel` (`:143-160`) checks `ViewChannel` per channel and `toView` (referenced at `:87,96,113,132-138`, not shown above) sets `contentHidden` when false — this is the pattern history access must reuse (see message-reports.md: "message.content is redacted to '' and message.contentHidden is true").
- `apps/web/src/components/chat/MessageRow.tsx:315` shows a plain, non-interactive `{t('message.edited')}` label (`apps/web/src/i18n/locales/en/chat.ts:110`, `'message.edited': 'edited'`) next to the timestamp — no click target today.
- Account export (`apps/api/src/modules/users/account-export-collector.ts:67-85`) selects the author's own messages with `content` and `editedAt` but no revision data, and only for `deletedAt: null` rows.
- Account deletion is a two-step, delayed **anonymization**, not a hard delete: `AccountDeletionService.completeDeletion` runs `anonymizeAccount` in one transaction (`apps/api/src/modules/users/account-deletion.service.ts:124-130`). `anonymizeAccount`'s own doc comment states the rule this doc must follow: "The `User` row is kept … What goes is everything that identifies the person or is private to them; content other members see stays, attributed to 'Deleted User'" (`apps/api/src/modules/users/account-anonymization.ts:27-29`). Concretely, the `User` row is scrubbed of identity/credentials fields (`:49-72`), and `deletePrivateAccountRows` (`:123-152`) hard-deletes only private, per-user rows (sessions, OAuth, tokens, push subscriptions, notification prefs, read state, saved messages, scheduled messages, export jobs, server memberships) — `Message`/`DirectMessage` rows are never touched there, and `anonymizeNameSnapshots` (`:189-208`) only rewrites `forwardOriginAuthorName`, never `content`. So **`Message.content` (and, once added, `MessageRevision.content`) is never deleted or cascaded on account deletion today** — a message's own FK cascade (`onDelete: Cascade` from `MessageRevision.messageId` to `Message`) only fires if the `Message` row itself is deleted, which anonymization deliberately does not do.
- Latest migration folder: `apps/api/prisma/migrations/20260918007000_add_stage_channels`; a new migration follows the same `YYYYMMDDHHmmss_description` naming.
- `Dialog` (`apps/web/src/components/ui/Dialog.tsx`) is the shared modal primitive already used for read-only content views elsewhere in the report flow (`ReportMessageDialog.tsx`, per `message-reports.md` Client section).

## Changes

### Rules / Flow

1. New model `MessageRevision`: `id`, `messageId`, `content` (the value being replaced), `editedAt` (the edit's timestamp — copied from the same `new Date()` used for `Message.editedAt` in that write), `createdAt`. One row per edit, written for the content the edit is _replacing_, not the new content — so revision N holds what the message said before edit N, and the current `Message.content` always holds the latest text with no matching revision row of its own.
2. `MessagesService.updateMessage` writes the outgoing `message.content` into a new `MessageRevision` row in the same transaction as the `message.update`, before the AutoMod-approved new content lands. If AutoMod blocks the edit (throws), no revision is written — mirrors today's "a blocked edit throws here, so the stored content stands" comment (`messages.service.ts:415`).
3. Revision cap: at most `MESSAGE_REVISION_LIMIT` (20) rows kept per message. On the 21st edit, the oldest revision is deleted in the same transaction as the new one is inserted (a bounded FIFO), so a message cannot accumulate unbounded history rows from repeated edits. This is a hidden cap for now — the UI does not display "history truncated"; it is out of scope to signal truncation since 20 edits of one message is already an edge case.
4. Deleting a message (`deleteMessage`, `messages.service.ts:441-474`) also deletes all of its `MessageRevision` rows in the same transaction as the soft-delete update, so the pre-delete history does not outlive the message's visible content — consistent with `content: ''` already wiping the live text on delete.
5. Viewing history:
   - **Moderator path**: `GET /servers/:serverId/reports/:reportId/message-history` — loads the `MessageReport`, requires `MANAGE_MESSAGES` on `serverId` (`requireServerPermission`, same call `ReportsService.list` already makes), requires `targetType === 'MESSAGE'` and a non-null `messageId` on the report, then returns that message's revisions ordered oldest-first, each carrying `content`, `editedAt`. If the moderator cannot view the message's channel (the same `hasChannelPermission(ViewChannel)` check `viewableByChannel` already runs), every revision's `content` is redacted to `''` with `contentHidden: true`, exactly like `MessageReportView.message` today.
   - **Author path**: `GET /messages/:messageId/history` — requires the caller to be `message.authorId` (no `MANAGE_MESSAGES` bypass; an author-only view, matching `updateMessage`'s own authorship check), returns the same revision shape, uncensored (the author already knows their own content).
6. `MessageRevision` is included nowhere in the realtime `message:updated` payload — history is pull-based, fetched only when the dialog opens, matching the pull-based report queue precedent (`message-reports.md` Trade-offs: "Pull-based queue vs. realtime push").
7. **Account export**: `collectAccountExport` (`account-export-collector.ts:67-85`) adds each exported message's own revisions, bounded the same way the rest of that file bounds lists (`bounded()`, built around `ACCOUNT_EXPORT_MESSAGE_LIMIT`-style ceilings), included only for the author's own non-deleted messages (same `authorId: userId, deletedAt: null` filter the message export already uses) — symmetric with `content`/`editedAt` already being exported for those same rows.
8. **Account deletion**: because `anonymizeAccount` deliberately keeps `Message.content` (Current behavior above), `MessageRevision` rows would otherwise survive the account's deletion indefinitely with no explicit decision behind it. This doc decides revisions are **not** covered by the "content other members see stays" rule — a revision is never something another member is shown by default (only a `MANAGE_MESSAGES` moderator with an open report, or the author, can ever see one), so it is closer to the "private to them" category `anonymizeAccount`'s own comment carves out. `anonymizeAccount` therefore gains one explicit delete: `tx.messageRevision.deleteMany({ where: { message: { authorId: userId } } })`, called from `deletePrivateAccountRows` (`account-anonymization.ts:123-152`) alongside the other per-user hard deletes — the live `Message.content` itself is untouched, only its revision history is removed.

### Edge cases

| Case                                                                                   | Expected behavior                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message never edited                                                                   | Revision list is empty; both endpoints return `{ revisions: [] }`, `200`, not `404` — an unedited message is not an error case.                                                                                                                                                                                                     |
| Message edited once                                                                    | One revision: the original content. Current `message.content` is the live (second) version, not duplicated into the list.                                                                                                                                                                                                           |
| Message deleted after being edited                                                     | `MessageRevision` rows are gone (cascade-deleted with the message in `deleteMessage`); the report-history endpoint 404s the same way `ReportsService` already handles a nulled `messageId` — see `message-reports.md`: "message can be deleted after being reported … the queue must render a 'message no longer available' state." |
| Moderator lacks `MANAGE_MESSAGES`                                                      | `403`, same as `ReportsService.list` (`requireServerPermission` throws `ForbiddenException`).                                                                                                                                                                                                                                       |
| Moderator has `MANAGE_MESSAGES` but not `ViewChannel` on the message's channel         | `200`, but every revision's `content` is `''` with `contentHidden: true` — same redaction as the report's `message` field.                                                                                                                                                                                                          |
| Report's `targetType` is `USER` (no `messageId`)                                       | `404 Message not found` on the report-history endpoint — nothing to show history for.                                                                                                                                                                                                                                               |
| Caller of the author-path endpoint is not the message's author                         | `403`.                                                                                                                                                                                                                                                                                                                              |
| Caller of the author-path endpoint is a `MANAGE_MESSAGES` moderator but not the author | `403` on the author-path endpoint — moderators use the report-history endpoint instead, which requires an actual `MessageReport` to exist; a moderator cannot browse an arbitrary user's edit history with no report filed.                                                                                                         |
| 21st edit of the same message                                                          | Oldest revision row is deleted; the new pre-edit content is inserted; list still returns at most 20 rows.                                                                                                                                                                                                                           |
| Message's author deletes their account                                                 | Revisions for that author's messages are hard-deleted during anonymization; `Message.content` itself is untouched (per `anonymizeAccount`'s existing "content stays" rule) — history endpoints for those messages afterward return an empty list, not an error, same as "never edited."                                             |

## Technical approach

**Files touched**

| File                                                                                                                         | Change                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/prisma/models/messages.prisma`                                                                                     | Add `MessageRevision` model; add `revisions MessageRevision[]` relation on `Message`.                                                                                                                                                                                          |
| `apps/api/prisma/migrations/20260921002000_add_message_revisions/migration.sql`                                              | New hand-written migration.                                                                                                                                                                                                                                                    |
| `apps/api/src/modules/messages/messages.service.ts`                                                                          | `updateMessage`: wrap the update in `prisma.$transaction`, insert the outgoing content as a `MessageRevision`, enforce the 20-row cap; `deleteMessage`: delete revisions in the same transaction as the soft-delete; new `getMessageHistory(userId, messageId)` (author path). |
| `apps/api/src/modules/messages/messages.controller.ts`                                                                       | `GET messages/:messageId/history` → `getMessageHistory`.                                                                                                                                                                                                                       |
| `apps/api/src/modules/reports/reports.service.ts`                                                                            | New `getMessageHistory(userId, serverId, reportId)`: loads the report, `requireServerPermission(MANAGE_MESSAGES)`, resolves the message's revisions, reuses the same channel-viewability redaction as `list()`.                                                                |
| `apps/api/src/modules/reports/reports.controller.ts`                                                                         | `GET servers/:serverId/reports/:reportId/message-history` → `getMessageHistory`.                                                                                                                                                                                               |
| `apps/api/src/modules/users/account-export-collector.ts`                                                                     | Add each exported message's revisions to the message export payload, bounded like the rest of the file.                                                                                                                                                                        |
| `apps/api/src/modules/users/account-anonymization.ts`                                                                        | `deletePrivateAccountRows`: add `tx.messageRevision.deleteMany({ where: { message: { authorId: userId } } })` before the `serverMember.deleteMany` that leaves every server.                                                                                                   |
| `packages/shared/src/api-contract.ts`                                                                                        | `MessageRevisionView` type (`{ id, content, editedAt, contentHidden }`); response types for both new endpoints; export payload type gains per-message revisions.                                                                                                               |
| `apps/web/src/api.ts`                                                                                                        | `getMessageHistory(messageId)`, `getReportMessageHistory(serverId, reportId)`.                                                                                                                                                                                                 |
| `apps/web/src/query/queryKeys.ts`                                                                                            | `queryKeys.messageHistory(messageId)`, `queryKeys.reportMessageHistory(reportId)`.                                                                                                                                                                                             |
| `apps/web/src/hooks/useMessageHistory.ts` (new)                                                                              | React Query hooks wrapping the two endpoints.                                                                                                                                                                                                                                  |
| `apps/web/src/components/chat/MessageRow.tsx`                                                                                | Make the `{t('message.edited')}` label (`:315`) a button opening `MessageHistoryDialog`, for the message's own author only.                                                                                                                                                    |
| `apps/web/src/components/chat/MessageHistoryDialog.tsx` (new)                                                                | Reuses `Dialog` (`apps/web/src/components/ui/Dialog.tsx`); read-only, oldest-to-newest list of `{ content, editedAt }`, "no edits yet" empty state.                                                                                                                            |
| `apps/web/src/components/settings/ReportsSection.tsx`                                                                        | Add a "View edit history" action on report rows whose `targetType === 'MESSAGE'`, opening the same `MessageHistoryDialog` fed by `getReportMessageHistory`.                                                                                                                    |
| `apps/web/src/i18n/locales/en/chat.ts`, `vi/chat.ts` (and the reports-section locale file, same base name under each locale) | New strings: dialog title, empty state, "View edit history" action label.                                                                                                                                                                                                      |

**API contract**

- `GET /messages/:messageId/history`
  - Response `200`: `{ revisions: MessageRevisionView[] }`, oldest first.
  - Errors: `404` message not found or deleted · `403` caller is not the message's author.
- `GET /servers/:serverId/reports/:reportId/message-history`
  - Response `200`: `{ revisions: MessageRevisionView[] }`, oldest first (each `content: ''`, `contentHidden: true` when the moderator lacks `ViewChannel`).
  - Errors: `403` caller lacks `MANAGE_MESSAGES` on `serverId` · `404` report not found in this server, report's `targetType` is not `MESSAGE`, or the reported message no longer exists (`messageId` was nulled by `onDelete: SetNull`, same as `message-reports.md`'s "message no longer available").
- `MessageRevisionView`: `{ id: string; content: string; editedAt: string; contentHidden: boolean }`.

**DB / migration**

- New table `MessageRevision`: `id String @id @default(cuid())`, `messageId String`, `content String`, `editedAt DateTime`, `createdAt DateTime @default(now())`, `message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)`.
- Index: `@@index([messageId, createdAt])` — the only read pattern is "all revisions for one message, oldest first."
- No FK to `User`/editor — a revision only ever comes from the message's own author (`updateMessage` already enforces `message.authorId !== userId` → `403`), so recording an editor id would always duplicate `Message.authorId`.
- Migration file: `apps/api/prisma/migrations/20260921002000_add_message_revisions/migration.sql`, hand-written `CREATE TABLE` + index, `down()` drops the table. New table, no lock on `Message` itself, safe on a live table of any size.
- No backfill: existing edited messages have no prior content in memory anywhere to recover, so their history starts empty from this point forward (matches `mutedUntil`'s "existing rows unaffected" precedent in `timed-notification-mute.md`).

**Libraries** — none new; reuses `Dialog` (`apps/web/src/components/ui/Dialog.tsx`) and the repo's existing Prisma interactive transaction pattern (already used for `ReportsService.create`, `reports.service.ts:88-116`).

## Trade-offs

| Option                                                                                                             | Pros                                                                                                                                                                                                       | Cons                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A (chosen): separate `MessageRevision` table, one row per past version**                                         | Queryable, indexable, bounded per-message with a simple delete-oldest cap; matches the repo's existing pattern of a dedicated table for a bounded per-parent history (`MessageReport` itself, `AuditLog`). | One extra table, one extra write (in a transaction) per edit.                                                                                                                                                                                                                                 | Chosen — the report-queue use case needs to query "revisions for this message," which a table supports directly.                       |
| B: JSON array column on `Message` (e.g. `priorVersions Json`)                                                      | No new table, no join.                                                                                                                                                                                     | Prisma/Postgres JSON columns are harder to index and to cap ("delete the oldest element") than rows in `WHERE`/`ORDER BY`; growing an array in place also risks read-modify-write races on concurrent edits (the repo's `database.md` rule against races) in a way a plain `INSERT` does not. | Rejected — a table is the more natural fit for a capped, ordered, per-parent list.                                                     |
| C: keep full history forever (no cap)                                                                              | Simplest to reason about, no delete-oldest logic.                                                                                                                                                          | Unbounded growth for a message edited very often (e.g. abusive users editing to evade AutoMod, then re-editing repeatedly) has no ceiling; the repo already caps analogous per-user lists (`ACCOUNT_EXPORT_MESSAGE_LIMIT`, `LIST_LIMIT` in `reports.service.ts`).                             | Rejected — an attacker-controlled unbounded write is a real cost with no offsetting benefit (nobody reviews 500 edits of one message). |
| D: snapshot content on the `MessageReport` row itself at report-creation time (add `messageReportSnapshotContent`) | Solves the specific "edited after being reported" case with no new table.                                                                                                                                  | Only helps if a report already exists before the edit; does nothing for a message edited multiple times, or for the author's own "what did I originally write" use case; also duplicates data already produced by option A.                                                                   | Rejected — narrower fix for the same problem, and does not cover the author-facing acceptance criterion at all.                        |
| E: revisions visible to any `MANAGE_MESSAGES` moderator directly by `messageId`, no report required                | Simpler endpoint (no report lookup), lets moderators inspect any message's history proactively.                                                                                                            | Turns "moderators review reported content" into "moderators can browse anyone's edit history with no report filed" — a broader surveillance capability than the rest of the moderation surface grants (delete/report/ban are all reactive to a specific incident, not a free-browse tool).    | Rejected — tying the moderator path to an existing `MessageReport` keeps the same reactive-only boundary the rest of moderation uses.  |

What the chosen option costs: every edit now does two writes instead of one (revision insert + message update, wrapped in a transaction so they commit together); the report-history endpoint duplicates part of `ReportsService.list`'s channel-visibility check rather than sharing a helper, which is a small duplication accepted to keep `list()`'s shape unchanged for its own callers.

**Decided** (2026-09-18, this doc, both accepted as written rather than left open):

- **Retention cap: 20 revisions per message, count-based, not time-based.** Reason: matches the repo's existing count-based ceilings (`ACCOUNT_EXPORT_MESSAGE_LIMIT`, `LIST_LIMIT` in `reports.service.ts`) rather than introducing a new time-based sweep this repo has no scheduler for (`timed-notification-mute.md` Trade-offs: "the repo has no scheduler installed").
- **Moderator access stays reactive-only (Option E rejected, tied to an existing `MessageReport`).** Reason: keeps history in line with the rest of the moderation surface, which only ever acts on a filed incident (report, delete, ban), never lets a moderator free-browse a member's content.

## Risks & rollback

- **What can break**: `updateMessage` moves from a single `prisma.message.update` to a transaction (revision insert + cap-delete + message update); a slower/heavier transaction on the hot edit path, though still a handful of small writes on indexed single-row lookups — no different in kind from the transaction `ReportsService.create` already runs.
- **Not covered**: DM edit history (see Scope), diffing between revisions, restoring a prior revision, any change to AutoMod's own scanning behavior.
- **Rollback**: revert the code; the migration is additive (`down()` drops the `MessageRevision` table) and safe to roll back independently — no other table references it. Revision rows written before rollback are simply lost, which only means their edit history becomes unavailable again, not a data-integrity risk for `Message` itself.

## Test plan

Not covered by automated tests (repo has no test suite by policy).

**Manual**

1. Edit a channel message twice → `GET /messages/:messageId/history` as the author returns two revisions, oldest first, each holding the content that was replaced at that step (not the final content).
2. File a report on a message, then edit the message → `GET /servers/:serverId/reports/:reportId/message-history` as a `MANAGE_MESSAGES` moderator shows the pre-edit content, even though `GET /servers/:serverId/reports` now shows the message's current (edited) content.
3. Same as above, but the moderator lacks `ViewChannel` on the message's channel → history returns `200` with every revision's `content: ''`, `contentHidden: true`.
4. A member without `MANAGE_MESSAGES` calls the report-history endpoint directly → `403`.
5. A user who is neither the author nor the reporter's moderator calls `GET /messages/:messageId/history` for someone else's message → `403`.
6. Delete a message that has two revisions → both endpoints subsequently 404 (message no longer resolvable / revisions gone).
7. Edit the same message 21 times → history list still returns exactly 20 rows, and the oldest (1st) edit's content is no longer present.
8. In the web client: click the "edited" label on your own message → dialog opens showing prior versions; click it on someone else's message → no click target renders (author-only).
9. In the moderator queue (`ReportsSection.tsx`), open "View edit history" on a `MESSAGE`-type report → same dialog, fed by the report-scoped endpoint.
10. Edit a channel message, then trigger the account data export for its author → the export's message entry for that message includes its revisions.
11. Edit a channel message, then complete account deletion for its author (past the grace period, via the sweep) → `MessageRevision` rows for that author's messages are gone (direct `SELECT` on `MessageRevision` for one of their message ids returns none), while `Message.content` for that same message is still readable exactly as before (anonymization does not touch it) — confirms the "revisions removed, live content stays" split.

## Deployment notes

- New env vars: none.
- Migration `20260921002000_add_message_revisions` must run before deploying the API (adds a new table, no lock on existing tables).
- Shared package (`packages/shared`) must be rebuilt before the API/web build, per the repo's monorepo build order.
- No cache/queue to clear.
- No breaking API change: both endpoints are new; no existing response shape changes.
- Add the new i18n strings to the `en`/`vi` chat and reports-section locale files and run `npm run i18n:check` before merging the web change.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code. Line numbers refer to the code after
this change.

- **Shared helper instead of duplicated logic.** The write and the read live in
  `apps/api/src/modules/messages/message-revisions.ts`: `recordMessageRevision` (`:12`) inserts the
  replaced content and deletes whatever is older than the newest `MESSAGE_REVISION_LIMIT` rows, and
  `listMessageRevisions` (`:31`) is used by both endpoints. The moderator path passes its
  `ViewChannel` result as the redaction flag; the permission check itself stays in
  `ReportsService.getMessageHistory` (`apps/api/src/modules/reports/reports.service.ts:216`), so
  `list()` is unchanged. The read takes the newest 20 and reverses them, so a cap overshoot from two
  concurrent edits never hides the latest version.
- **`MESSAGE_REVISION_LIMIT` is a shared constant** (`packages/shared/src/api-contract.ts`), next to
  the new `MessageRevisionView` and `MessageHistoryResult` types. `MessageRevisionView.editedAt` is
  `Date` in the shared contract, like every other shared view; it is an ISO string on the wire and the
  web reads it through `Json<>` (`apps/web/src/api.ts`, `MessageRevision`).
- **No shared export type change.** The account export has no shared payload type (its shape is
  inferred from `collectAccountExport`), so the per-message `revisions: { content, editedAt }[]` is
  added only in `apps/api/src/modules/users/account-export-collector.ts:86`, capped at
  `MESSAGE_REVISION_LIMIT` per message.
- **A soft-deleted message also 404s on the report path.** Deleting a channel message is a soft delete
  (`deletedAt`), so the report's `messageId` is not nulled; `getMessageHistory` treats a
  `deletedAt` message the same as a missing one (`404 Message not found`), like `toView` treats it as
  unavailable. A report that is not in `serverId` answers `404 Report not found`.
- **Author path runs the channel read check first.** `MessagesService.getMessageHistory`
  (`apps/api/src/modules/messages/messages.service.ts:483`) calls `requireReadableChannel` before the
  author check, mirroring `updateMessage`. A non-author gets `403 Only the author can view this
message history` (new API error key `ONLY_THE_AUTHOR_CAN_VIEW_THIS_MESSAGE_HISTORY`, in both API
  locales).
- **Web data layer follows the repo's hook pattern.** There are no per-endpoint functions in
  `apps/web/src/api.ts` (hooks call `apiRequest` directly, as `useMessageReports.ts` does); `api.ts`
  only gains the `MessageHistory` and `MessageRevision` types. The hooks file is
  `apps/web/src/hooks/useMessageRevisions.ts` (`useMessageRevisions`, `useReportMessageRevisions`),
  because `useMessageHistory.ts` already exists for loading older channel messages. The report key is
  `queryKeys.reportMessageHistory(serverId, reportId)`, since `serverId` is part of the request.
- **Two entry points for the author.** The "edited" label is a button for the author
  (`apps/web/src/components/chat/MessageRow.tsx:320`), and the message's context menu gains
  "Edit History" (`:548`) because the label only renders on the first message of a group. Both open
  `AuthorMessageHistoryDialog`; other people's messages keep the plain label.
- **Moderator entry point** is a ghost "View edit history" button under the report's text in
  `ReportsSection.tsx`, shown only for `MESSAGE` reports whose message is still live (a deleted message
  has no history). It opens `ReportMessageHistoryDialog`.
- **Encrypted revisions are not decrypted.** A revision of an end-to-end encrypted channel message is
  ciphertext; the dialog shows "Encrypted message" for it, as the report queue does, instead of
  applying the channel key to history. Redacted revisions show "You can't view this channel".
- **Locale files.** The report action string lives in `moderation.ts` (the reports-section catalog);
  the dialog strings (`message.history.*`), `message.editedViewHistory` and
  `message.menu.editHistory` in `chat.ts`; the load-error fallback in `common.ts` — `en` and `vi`.
