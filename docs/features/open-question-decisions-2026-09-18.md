# Feature Spec: Open Question Decisions, 2026-09-18

Three product-owner decisions closing open questions 35, 37 and 39 (`docs/features/open-questions.md`, Closed table). Each is small and touches a different module; they share one doc because they were decided together on the same date. Two of the three (37, 39) are one call-site changes; the third (35) is a new notification.

## Goal

Close open questions 35, 37 and 39:

- **35** — notify a server's owner when a platform admin delists their server from discovery.
- **37** — hide a reported message's content from a moderator who lacks `VIEW_CHANNEL` on its channel.
- **39** — block a timed-out member from editing their own messages, as Discord does.

Acceptance criteria:

- [ ] Delisting a server (`POST /platform/reports/:reportId/delist`) creates a `Notification` for that server's owner, in the owner's own locale, without revealing the reporter's identity.
- [ ] Relisting a server (`PATCH /servers/:serverId/discovery`) sends no notification — it is the owner's own action.
- [ ] The message-report queue already redacts content from a moderator without `VIEW_CHANNEL` on the message's channel (verified as implemented; see Current Behavior).
- [ ] `PATCH /messages/:messageId` (REST) and the `message:update` socket event both refuse a timed-out member's own edit with `403 You are timed out until <ISO date>`, for channel messages, thread replies and forum posts alike.

## Scope

**In scope**

- 35: a notification on delist, reusing the existing `Notification` model and `NotificationsService`.
- 37: confirming and documenting the redaction that already ships in the reports queue.
- 39: one `requireNotTimedOut` call in `MessagesService.updateMessage`, plus disabling the edit Save action client-side while the current user is timed out.

**Out of scope**

- 35: a UI/API to change `platformRole` (unrelated, already out of scope in `platform-report-review.md`), notifying on dismiss, notifying on relist (see Trade-offs).
- 37: reworking the report list's pagination or attachments — `MessageReport` never selects message attachments today, so there is nothing else to redact.
- 39: blocking a timed-out member from **deleting** their own messages (`MessagesService.deleteMessage`, `apps/api/src/modules/messages/messages.service.ts:440-473`, has no `requireNotTimedOut` call and this decision does not ask for it — Discord's own timeout also does not block deleting your own messages); fixing the pre-existing silent failure of message edits in general (see Edge cases).

## Current Behavior

### 35 — delist notification

- `PlatformReportsService.resolve()` sets `Server.listed = false` on `SERVER_DELISTED` and writes an `AuditLog` row, but does not touch `Notification` (`apps/api/src/modules/platform/platform-reports.service.ts:113-152`). `platform-report-review.md:131` already named this as a known gap ("no notification system reused here — flagged as a gap, not silently assumed").
- `Notification.type` is a plain `String` column, not an enum (`apps/api/prisma/models/notifications.prisma:41`), so a new notification type needs no migration — `DIRECT_MESSAGE` (`apps/api/src/modules/direct-messages/direct-messages.service.ts:173`) and `DM_MISSED_CALL` (`apps/api/src/modules/realtime/dm-calls.service.ts:161`) are both created this way.
- `NotificationsService.create(data: Prisma.NotificationUncheckedCreateInput)` inserts the row, recomputes the unread count, and emits `notification:created` to the recipient's user room (`apps/api/src/modules/notifications/notifications.service.ts:35-50`). It takes `title`/`body` as already-rendered strings — the model stores rendered text, not a catalog key.
- Two existing patterns for producing that text: `DIRECT_MESSAGE`/`DM_MISSED_CALL` build a literal English string with no locale lookup; `SCHEDULED_MESSAGE_FAILED` instead resolves the recipient's locale and calls `I18nService.t(locale, key, vars)` (`apps/api/src/modules/scheduled-messages/scheduled-message-sweep.service.ts:261-274`, keys `scheduledMessage.failed.title`/`.body` in `apps/api/src/common/i18n/locales/{en,vi}.ts:252-253,255-256`). `I18nModule` is `@Global()` (`apps/api/src/common/i18n/i18n.module.ts:4-8`), so `I18nService` needs no module import, only constructor injection.
- `User.locale` is a nullable `String` column (`apps/api/prisma/models/users.prisma:44`); `I18nService.resolveUserLocale(storedLocale)` falls back to `en` (`apps/api/src/common/i18n/i18n.service.ts:34-36`).
- Relisting is owner-initiated: `PATCH /servers/:serverId/discovery` sets `listed` back to `true`, gated on `MANAGE_SERVER` (`docs/features/server-templates-and-discovery.md:15,60`) — the owner (or a manager they trust) performs this action themselves, unlike delisting which is done to them by a platform admin they cannot see acting.
- `PlatformModule` currently imports only `AuthModule` (`apps/api/src/modules/platform/platform.module.ts:8`); `NotificationsModule` is not yet imported there.

### 37 — report content redaction

- This is **already implemented**, ahead of the product-owner decision: `qa-follow-ups-2026-09-18.md` built it as "the assumption for open question 37 until the product owner answers" (`qa-follow-ups-2026-09-18.md:95`), and the answer confirms it.
- `ReportsService.list()` computes one `VIEW_CHANNEL` check per distinct channel referenced by the page of reports (`viewableChannelMap`, `apps/api/src/modules/reports/reports.service.ts:149-163`), avoiding one permission check per report row.
- `toView(report, canViewChannel)` (`apps/api/src/modules/reports/reports.service.ts:237-261`) sets `message.content` to `''` and `message.contentHidden` to `true` when the moderator cannot view the channel; `MessageReportView.message.contentHidden: boolean` is in the shared contract (`packages/shared/src/api-contract.ts:588`).
- The web queue already renders it: `ReportsSection.tsx:98-106` shows `t('reports.messageHidden')` when `report.message.contentHidden` is true, ahead of the encrypted-message and unavailable-message checks.
- There is no separate report-detail endpoint (only `list` and `updateStatus`, `apps/api/src/modules/reports/reports.controller.ts:29,52,62`), so there is only one read path to cover, and it is covered.
- `docs/features/message-reports.md` was still stale about this (its API contract table omitted `contentHidden` and its rules list did not mention the redaction) — fixed in place in this change (see Technical approach).

### 39 — timed-out member editing

- `MessagesService.updateMessage` (`apps/api/src/modules/messages/messages.service.ts:396-438`) checks channel readability, authorship, and `requireOnboardingAccepted`, but never calls `requireNotTimedOut` — the one gap among the participation paths the permission service's own comment claims are covered (`apps/api/src/modules/permissions/permissions.service.ts:75-78`, "Sits beside `requireNotTimedOut` on every participation path: sends ..., thread replies, edits, reactions, poll votes and voice joins" — inaccurate for edits before this change).
- `requireNotTimedOut` is already called in `createMessage`/`createThreadMessage` (via `passSendGates`, `apps/api/src/modules/messages/messages.service.ts:193`), `createThreadMessage` directly (`:309`), and `toggleReaction` (`:481`), always before `requireOnboardingAccepted`, so the ordering to match is established.
- Both write paths call the same service method: `MessagesController.updateMessage` (REST, `PATCH /messages/:messageId`, `apps/api/src/modules/messages/messages.controller.ts:110`) and `MessagesGateway.updateMessage` (`message:update`, `apps/api/src/modules/realtime/messages.gateway.ts:117-132`) both call `MessagesService.updateMessage`. The gateway already catches `HttpException` and acknowledges `{ error }` (`messages.gateway.ts:128-131`), so no gateway change is needed — the ack path is already wired.
- Thread replies and forum posts are plain `Message` rows with `threadId` set; they are edited through the same `updateMessage` method (it branches only on `updated.threadId` to choose the emitted event name, `messages.service.ts:433`) and the forum module has no separate edit path (`apps/api/src/modules/forum/forum-posts.service.ts` has no `update`/`edit` method) — one fix covers channel, thread and forum message edits.
- On the web, the composer already disables sending during a timeout using a client-computed hint: `useComposerRestrictions` derives `activeTimeoutUntil(server, userId, now)` from data already loaded and renders `t('composer.timedOutUntil', { time })` (`apps/web/src/hooks/useComposerRestrictions.ts:27,51-56`); the `en`/`vi` string already exists (`apps/web/src/i18n/locales/{en,vi}/chat.ts:58`). This hint is wired only to the composer, not to the inline message-edit row.
- The inline message edit UI (`MessageRow.tsx:318-330`) calls `void actions.saveEdit(message.id)` with no `.catch` (`apps/web/src/components/chat/MessageRow.tsx:328`), and `saveMessageEdit` (`apps/web/src/hooks/useChannelMessageActions.ts:58-90`) has no try/catch either — an `ApiError` becomes an unhandled promise rejection today, for **any** edit refusal (including the existing "Only the author can edit this message" case), not just a new timeout one. The app renders no toasts anywhere (`message-reports.md:49`, "The app renders no toasts anywhere today"), so there is no existing reactive-error pattern to reuse for this. This is a pre-existing gap, out of scope to fix generally (see Edge cases and Trade-offs).

## Changes

### 35 — delist notification

1. `PlatformReportsService.resolve()`, in the `resolution === 'SERVER_DELISTED'` branch, after the `server.update` that sets `listed: false`, selects the server's `name`, `ownerId` and the owner's `locale` in the same query (`select: { name: true, owner: { select: { id: true, locale: true } } }`) instead of a second round trip.
2. It resolves the owner's locale with `I18nService.resolveUserLocale(owner.locale)` and calls `NotificationsService.create({ userId: owner.id, type: 'SERVER_DELISTED', title: i18n.t(locale, 'notification.serverDelisted.title', { serverName: server.name }), body: resolutionNote ? i18n.t(locale, 'notification.serverDelisted.bodyWithNote', { note: resolutionNote }) : i18n.t(locale, 'notification.serverDelisted.body') })`. No `channelId`/`messageId`/`conversationId` — a delisted server has no single channel to jump to.
3. The reporter's identity is never included in the title, body, or any field of the created `Notification` — the owner learns their server was delisted and, if the admin left one, the moderator's note, never who reported it.
4. `DISMISSED` resolutions and `PATCH /servers/:serverId/discovery` relists send no notification (see Trade-offs).
5. `PlatformModule` imports `NotificationsModule` so `PlatformReportsService` can inject `NotificationsService`; `I18nService` needs no module import (`I18nModule` is `@Global()`).

### Edge cases (35)

| Case                                                                                                    | Expected behavior                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server has no owner locale set (`User.locale` is `null`)                                                | `resolveUserLocale(null)` falls back to `en`.                                                                                                                  |
| Delisting an already-unlisted server (idempotent `Server.listed` write, `platform-report-review.md:55`) | The resolution still transitions from `OPEN`, so the notification still fires — the owner is told the report was acted on even though `listed` did not change. |
| Admin includes a `note` on delist                                                                       | The note is included in the body (`bodyWithNote`), still with no reporter identity.                                                                            |
| Dismiss (not delist)                                                                                    | No notification — dismissing has no visible effect on the owner's server.                                                                                      |

### 37 — report content redaction

No code change: the redaction described in Current Behavior already matches the decision. Only the two stale doc lines in `message-reports.md` are corrected (see Technical approach).

### 39 — timed-out member editing

1. `MessagesService.updateMessage` gains `await this.permissions.requireNotTimedOut(userId, message.serverId);` right after the authorship check and before `requireOnboardingAccepted`, matching the ordering used by `passSendGates` and `toggleReaction`.
2. No change needed in `MessagesController` or `MessagesGateway` — both already surface an `HttpException` as, respectively, a normal `403` response and a `{ error }` socket acknowledgement.
3. Web: the inline edit row (`MessageRow.tsx`) receives the same `composerRestriction` (or the subset it needs — `disabledReason`) already computed by `useComposerRestrictions` and threaded through `AppShell.tsx` to the composer. While `disabledReason` is set, the edit row's Save button is disabled and shows the same `t('composer.timedOutUntil', { time })` text next to it, instead of letting the request round-trip and fail silently. This reuses the existing proactive-disable pattern instead of adding a new reactive error-display mechanism (see Trade-offs).

### Edge cases (39)

| Case                                                                                                                  | Expected behavior                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Member is timed out mid-edit (was not timed out when they opened the edit box)                                        | The next render tick (the composer's 1s ticking interval already re-evaluates `activeTimeoutUntil`, `useComposerRestrictions.ts:38-43`) disables Save; a forced `PATCH` still gets `403` from the server, which remains authoritative.                                          |
| Timeout expires while the edit box is open                                                                            | Save re-enables on the same tick, no page reload needed.                                                                                                                                                                                                                        |
| Owner is "timed out" (cannot happen — `requireNotTimedOut` never restricts the owner, `permissions.service.ts:64-71`) | N/A, unreachable.                                                                                                                                                                                                                                                               |
| Editing a thread reply or forum post while timed out                                                                  | Same `403`, since it is the same `updateMessage` call — the thread panel's edit UI (`ThreadMessageActions.tsx`, `wave-3-2-follow-ups.md` "Thread and forum message actions") needs the same client-side disable to avoid the same silent failure; listed in Technical approach. |
| Deleting your own message while timed out                                                                             | Still allowed — `deleteMessage` has no `requireNotTimedOut` call and this decision does not add one (see Scope).                                                                                                                                                                |

## Technical Approach

**Files touched**

| File                                                                                                             | Change                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/platform/platform-reports.service.ts`                                                      | `resolve()`: select owner + locale in the `SERVER_DELISTED` branch's `server.update`, call `NotificationsService.create`.                                                  |
| `apps/api/src/modules/platform/platform.module.ts`                                                               | Import `NotificationsModule`.                                                                                                                                              |
| `apps/api/src/common/i18n/locales/en.ts`, `vi.ts`                                                                | Add `notification.serverDelisted.title`, `.body`, `.bodyWithNote`.                                                                                                         |
| `apps/api/src/modules/messages/messages.service.ts`                                                              | `updateMessage`: add `requireNotTimedOut` call.                                                                                                                            |
| `apps/web/src/hooks/useComposerRestrictions.ts` / `AppShell.tsx` / `MessageRow.tsx` / `ThreadMessageActions.tsx` | Thread `disabledReason` to the inline edit Save action in both the channel message row and the thread panel's edit row; disable Save and show the existing timed-out text. |
| `docs/features/message-reports.md`                                                                               | Doc drift fix: add `contentHidden` to the `MessageReportView` contract line and note the redaction rule (done in this change, see below).                                  |
| `docs/features/member-timeout-and-slowmode.md`                                                                   | Doc drift fix: list `updateMessage` among the enforced call sites and update the acceptance criteria / test plan lines (done in this change).                              |
| `docs/features/platform-report-review.md`                                                                        | Doc drift fix: close the "not covered: notifying the owner" gap (done in this change).                                                                                     |

**API contract**

- No new endpoint. `POST /platform/reports/:reportId/delist` keeps its existing request/response shape (`{ note? } → 200 { report }`); it now has an added side effect (a `Notification` row + `notification:created`/`notification:unread` socket events to the owner's user room), not a payload change.
- `PATCH /messages/:messageId` and the `message:update` socket event keep their existing shapes; a timed-out author now additionally gets `403 You are timed out until <ISO date>` (same literal already used by the other participation paths, already mapped to `MEMBER_TIMED_OUT` by the prefix rule in `apps/api/src/common/i18n/error-codes.ts:234`).

**DB / migration**

- None. `Notification.type` is a free-text `String` column (no enum to extend); `requireNotTimedOut` is an existing method called from a new call site.

**Libraries** — none added; reuses `I18nService` (already `@Global()`) and the existing `NotificationsService`/`PermissionsService`.

## Trade-offs

| Option                                                                                                                 | Pros                                                                                                                                                                                                 | Cons                                                                                                                                                                                                   | Verdict                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Notify only on delist, not on dismiss or relist (chosen)**                                                           | Matches what actually changes for the owner — dismiss has no visible effect on their server, and relist is the owner's own action, so a notification about it would just echo back what they clicked | An owner who watches audit logs closely gets no notification for a dismissed report either, even though a report was filed                                                                             | **Chosen** — a notification for an action the owner did not take and did not cause is the useful case; the other two are already visible to the owner through their own action or through the existing `PLATFORM_REPORT_DISMISS`/`PLATFORM_REPORT_DELIST` audit log entries their server's `MANAGE_SERVER` holders can already read (`platform-report-review.md:57`) |
| Reveal the reporter's identity in the notification                                                                     | Lets the owner know who to expect an appeal from                                                                                                                                                     | Reports are meant to let any member flag abuse without the reported party retaliating; `message-reports.md` and `platform-report-review.md` never expose the reporter to the reported side             | Ruled out — never include the reporter                                                                                                                                                                                                                                                                                                                               |
| Locale-keyed `I18nService.t()` title/body (chosen) vs. a literal English string like `DIRECT_MESSAGE`/`DM_MISSED_CALL` | Matches the recipient's stored locale, consistent with `SCHEDULED_MESSAGE_FAILED`, the one existing precedent for a locale-sensitive notification body                                               | Two established patterns now coexist in the codebase (literal vs. keyed); this decision does not retrofit the older ones                                                                               | **Chosen** — the task explicitly asks for `en`/`vi` catalog entries, which only the keyed pattern can satisfy without hardcoding English                                                                                                                                                                                                                             |
| Proactively disable the edit Save button (chosen) vs. reactively surfacing the `403` after a failed request            | Matches the composer's existing pattern exactly; needs no new error-display mechanism in an app that renders no toasts anywhere                                                                      | Does not fix the pre-existing silent failure for _other_ edit refusals (e.g. attempting to edit a poll message, or a message that was deleted by someone else between opening the edit box and saving) | **Chosen** for this decision's scope — fixing silent failure on every edit-refusal path is a larger, separate change; flagged as a known gap, not silently left unexamined                                                                                                                                                                                           |

What the chosen option costs: 35 adds one extra `select` field (free, same query) and one `NotificationsService.create` call on an already-low-traffic admin action; 39 adds one indexed `ServerMember` lookup (already the cost of every other `requireNotTimedOut` call site) to every message edit, and a small prop-threading change on the web to reach the thread panel's edit row.

## Risks & Rollback

- **35**: none of the changed code paths are read by anything else — `Notification.type: 'SERVER_DELISTED'` is a new value in an untyped `String` column, so nothing needs to recognize it except the notification list UI's generic `title`/`body` rendering (`UtilityPanel.tsx:347`), which already renders any `type` the same way. **Not covered**: a "jump to server" action from the notification — there is no single destination channel to open, so the notification is informational only, like `DM_MISSED_CALL` before this change added `conversationId` handling for its own type. **Rollback**: revert the code; no data is destroyed, existing `Notification` rows are unaffected.
- **37**: no change — nothing to roll back.
- **39**: a member relying on being able to fix a typo in their own message while timed out loses that ability, matching Discord. **Not covered**: the pre-existing silent failure of every other edit-refusal path on the web (see Trade-offs) — noted, not fixed here. **Rollback**: revert the `requireNotTimedOut` call and the web prop-threading; no migration involved.

## Test Plan

Not covered by automated tests (repo rule: no `*.test.ts`/`*.spec.ts`). Verified with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`; the manual scenarios below have not been run against a live stack in this change.

**Manual**

1. As a platform admin, delist a listed server with a note → the server's owner receives a `notification:created` socket event and, on reload, a `SERVER_DELISTED` row in their notification list with the note text, in their own locale (`vi` if their profile locale is `vi`); nothing in the title or body names the reporter.
2. Dismiss a report instead → the owner gets no notification.
3. As the owner, relist the server via server settings → still no notification (it was their own action).
4. As a moderator with `MANAGE_MESSAGES` but no `VIEW_CHANNEL` on a reported message's private channel → the queue shows the report with `contentHidden: true` and no text; with `VIEW_CHANNEL` granted, the same report shows the text. (Already passing today — regression check only.)
5. Time out a member for 60s, have them open the edit box on one of their own messages → Save is disabled with "You are timed out until …"; a forced `PATCH /messages/:id` (e.g. via a REST client) answers `403`; after the timeout expires, editing succeeds. Repeat for a reply inside a thread panel.
6. While timed out, attempt to delete your own message → still succeeds (unchanged).
7. Failure case: a non-author attempts to edit someone else's message while that author is not timed out → unchanged `403 Only the author can edit this message` (the new check does not affect this existing path, since `requireNotTimedOut` checks the _editor's_ own timeout, and only the author reaches that line).

## Deployment Notes

- No migration and no new env var.
- New `notification.serverDelisted.*` i18n keys land in both `en` and `vi` catalogs in the same change; run `npm run i18n:check`.
- No breaking API change — both fixes add a side effect / a new refusal case to existing endpoints; no client is required to change to keep working, though the web ships the edit-row disable in the same change so a timed-out user does not see an edit silently fail.

## Deviations From The Original Design

Written back after implementing, so the doc matches the code:

- **#39, thread panel.** The thread panel has no edit action at all (`ThreadPanel.tsx`,
  `ThreadMessageActions.tsx`); the only channel-message edit UI is `MessageRow.tsx`. So only
  `MessageRow` receives `editDisabledReason` (passed from `ChatPanel.tsx` as
  `composer.restriction.disabledReason`), which disables Save and shows the reason beside it. The
  API check covers thread and forum edits regardless.
- **#35, timing.** The notification is created after the resolve transaction commits, not inside
  it, so a rolled-back resolve never notifies the owner.

### Verification

`typecheck`, `lint`, `build`, `i18n:check`, `ui:scan` and `docs:check` pass. Against a local API and
database: a timed-out author gets `403 You are timed out until …` on `PATCH /messages/:id` and can
edit again once the timeout is cleared; a delist creates a `SERVER_DELISTED` notification for the
owner with the admin's note and no reporter identity. Not run: the disabled Save button in a
browser, and the `vi` wording of the notification.
