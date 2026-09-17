# Feature Spec: Account Deletion and Data Export

Lets a user permanently close their own account (re-authenticated, with a grace period) and download a copy of their own data, without violating the foreign keys that other rows hold against `User`.

## Goal

A user can request deletion of their account and, separately, request an export of their own data as a downloadable file; both require re-authentication and neither corrupts server history for other members.

Acceptance criteria:

- `POST /users/me/delete` requires the current password (and a TOTP/recovery code if 2FA is enabled) and schedules deletion after a grace period; the account is unusable for login during the grace period but recoverable by request until it elapses.
- A scheduled deletion that reaches its grace-period end anonymizes the `User` row and removes account-identifying data (sessions, OAuth links, push subscriptions, tokens); it does not delete `Message`/`DirectMessage`/`AuditLog` rows the user authored, because those relations have no cascade path (see Current Behavior).
- A user who owns one or more servers cannot complete deletion until every owned server is transferred to another owner or deleted, checked before scheduling and re-checked at grace-period end.
- `POST /users/me/export` requires the current password, runs asynchronously, and produces a downloadable archive with a link that expires; `GET /users/me/export/:jobId` reports job status.
- Deleting or exporting are both rate-limited per user.

## Scope

- **In scope**: deletion request/cancel, the grace-period scheduler, owned-server blocking check, anonymization of the `User` row, cleanup of `Session`/`OAuthAccount`/`PushSubscription`/tokens, an async export job producing a downloadable JSON archive with an expiring link, Settings UI for both flows.
- **Out of scope**: deleting or anonymizing message _content_ itself (kept, author shown as a deleted-user placeholder — see Changes), exporting other users' data, GDPR/legal-request tooling beyond the self-service flow, exporting voice call recordings (none are stored — out of this repository's scope entirely).

## Current Behavior

- There is no delete-account or export-data endpoint anywhere in `apps/api/src/modules/users` (`users.controller.ts` only has `GET /users/me`, `PATCH /users/me`, profile, and notification-preference routes).
- `User` is referenced by many tables. Two different `onDelete` behaviors exist:
  - **Cascades to nothing that matters for history** — deleting the row would silently remove: `Session`, `EmailVerificationToken`, `OAuthAccount`, `OAuthLoginCode`, `PasswordResetToken`, `TwoFactorRecoveryCode`, `ServerMember`, `MessagePin` join rows, `NotificationPreference`, `PushSubscription`, `PushNotificationThrottle`, `FriendRequest` (both directions), `UserBlock` (both directions), `DirectConversationMember`, `ThreadParticipant`, `DirectReadState`, `ReadState`, `Notification` (as `userId`), `ServerEventInterest`, `ServerBan` (as the banned user) — all declared `onDelete: Cascade` on the child side (`apps/api/prisma/schema.prisma`, e.g. `:99`, `:213`, `:229`).
  - **No `onDelete` clause on a required FK (Postgres default `Restrict`)** — a hard `DELETE FROM "User"` would be **rejected by the database** while any of these rows still reference the user: `Server.owner` (`schema.prisma:179`, `ownerId` required), `Message.author` (`:367`, `authorId` required), `Thread.createdBy` (`:387`), `MessagePin.pinnedBy` (`:435`), `AuditLog.actor` (`:508`), `ServerEmoji.creator` (`:200`), `ServerBan.bannedBy` (`:214`), `ServerEvent.creator` (`:318`). `DirectConversation.owner` and `Notification.actor` are the two required-User-relation exceptions that already do `onDelete: SetNull` (`:563`, `:636`).
  - This means: **a physical `DELETE` of a `User` row is impossible today for any account that ever sent a message, owned a server, created an emoji/event, pinned a message, banned someone, or has any audit entry** — which in practice is almost every account. This doc's design follows from that constraint rather than around it.
- Password verification is `bcrypt.compare(password, user.passwordHash)`, the same call `AuthService.login` uses (`apps/api/src/modules/auth/auth.service.ts:90`) and `TwoFactorService.disable` reuses for a sensitive action that also asks for a second factor (`apps/api/src/modules/auth/two-factor.service.ts:146-148`) — this doc's re-auth follows that existing pattern rather than inventing a new one.
- `SessionsService.revoke`/`revokeOthers` already knows how to revoke a session and disconnect its sockets via `RealtimePublisher` (`apps/api/src/modules/auth/sessions.service.ts:27-40`); nothing today revokes _every_ session for a user as one operation.
- File storage is abstracted behind `UploadsService`'s `storageDriver` config (`local` or `cloudinary`, `apps/api/src/modules/uploads/uploads.service.ts:241-243`); there is no existing "generate an archive and hand back a temporary link" flow to reuse — export is new plumbing.
- No `@nestjs/schedule` or queue dependency exists (confirmed in `docs/features/i18n-localization.md` and `docs/features/server-events.md`); the one in-process timer precedent is `RealtimeHeartbeatService`'s un-refed `setInterval` sweep (`apps/api/src/modules/realtime/realtime-heartbeat.service.ts:32-39`), which this doc's grace-period sweep follows.

## Changes

### Deletion rules

- `POST /users/me/delete` body `{ password, code? }`: verifies password with `bcrypt.compare`; if `twoFactorEnabledAt` is set, `code` is required and checked the same way `TwoFactorService.disable` checks it (TOTP ±1 step or an unused recovery code). Wrong password/code returns `400 Invalid password or code`.
- Blocks with `409 Transfer or delete your owned servers first` if `Server.findMany({ ownerId, deletedAt: null })` is non-empty — this reuses the required, non-nullable `ownerId` constraint (`schema.prisma:175,179`) rather than trying to work around it, since transferring ownership is already an explicit action a user should take deliberately.
- On success: sets `User.deletionRequestedAt = now()` and `User.deletionScheduledAt = now() + 14 days`, revokes every session (reusing the revoke-all shape of `SessionsService.revokeOthers`, extended to include the current one so the request's own token stops working after the response is sent), and returns `{ ok: true, scheduledAt }`.
- `POST /users/me/delete/cancel` (re-auth not required — canceling is not destructive) clears both fields while `deletionScheduledAt` has not yet passed; after it passes, cancellation is no longer possible (`409 Deletion already completed`).
- A grace-period sweep (60-second interval, same shape as the saved-message reminder sweep in `docs/features/saved-messages.md`) selects `deletionScheduledAt <= now()` and claims each row with a conditional `UPDATE ... WHERE deletionScheduledAt <= now() AND anonymizedAt IS NULL`, then, per user, inside one transaction:
  1. Re-checks the owned-servers block; if it now fails (a server was created during the grace period — should not happen since login is blocked, but re-checked defensively), the sweep skips it and logs a warning rather than deleting.
  2. Anonymizes the `User` row in place: `email` → `deleted-<id>@deleted.invalid`, `username` → `deleted-<id>`, `displayName` → `"Deleted User"`, `passwordHash` → a random unusable value, `avatarUrl`/`bio`/`bannerUrl`/`pronouns`/custom-status fields → `null`, `twoFactorSecret`/`twoFactorPendingSecret`/recovery codes → cleared, `deletionCompletedAt` → `now()`. The row itself is **not deleted**, because `Message.author`, `AuditLog.actor`, etc. still point at it (Current Behavior) — this is the only option compatible with the schema's `Restrict` relations without a data migration of every such table.
  3. Deletes everything that cascades cleanly and is account-identifying rather than content-historical: `Session`, `OAuthAccount`, `OAuthLoginCode`, `PasswordResetToken`, `EmailVerificationToken`, `TwoFactorRecoveryCode`, `PushSubscription`, `PushNotificationThrottle`, `NotificationPreference`. `ServerMember` rows are deleted too (leaves each server, freeing the `[userId, serverId]` unique slot and removing the member from rosters) — this cascades further to `MemberRole` and `ChannelPermissionOverride` rows scoped to that member, per their own `onDelete: Cascade`.
  4. Leaves `Message`/`DirectMessage`/`AuditLog`/`ServerBan`/`ServerEmoji`/`ServerEvent`/`MessagePin`/`Thread.createdBy` rows untouched; the client renders an anonymized author using the same `"Deleted User"` `displayName` the row now carries, no special-casing needed on read.
- Realtime: on schedule, `server:member-removed`-style per-server removal is **not** emitted immediately (the user keeps access during the grace period); at anonymization, the sweep emits `user:account-deleted` to each `server:<id>` the user was a member of and to `user:<id>` itself, so open clients drop the member from rosters and, for the deleted user's own (already logged-out) client, nothing further is needed since sessions were revoked at request time.
- Audit: `writeAuditLog` is server-scoped and requires a `serverId` (`apps/api/src/modules/messages/messages.service.ts:726`), which does not fit an account-level action across many servers; account deletion instead gets its own `AccountAuditLog`-free approach — logged only via the server's `Logger` (`this.logger.log('account deletion completed', { userId })`) per `rules/backend-nestjs.md` logging levels, with no PII in the log line, since there is no natural per-server audit entry for a cross-server action.

### Export rules

- `POST /users/me/export` body `{ password }`: same password re-auth as deletion (2FA code not required for export, since it is non-destructive and read-only — asymmetric with deletion by design, see Trade-offs). Creates an `ExportJob` row with `status: PENDING` and returns `{ jobId }`.
- Rate limit: 1 pending/running export per user at a time (`409 An export is already in progress` on a second request), and no more than 3 completed exports requested per user per 24 hours via `RedisFixedWindowLimiter` (`apps/api/src/common/redis-fixed-window-limiter.ts:25`).
- The job (run synchronously in-request for a first slice, given no queue exists — see Trade-offs) collects: profile fields, server memberships (server name, joined date, roles), messages authored (content, channel/server, timestamp — channel-scoped, not every server's full history, only the requester's own messages), direct messages authored, friend relationships, saved messages if `docs/features/saved-messages.md` ships first, notification preferences, and push subscription device names (not keys). It excludes: password hash, 2FA secrets, other users' messages, session tokens.
- The archive is written as a single JSON file through the same `UploadsService` storage abstraction uploads already use (`local` or `cloudinary` driver), under a non-guessable key; `ExportJob.downloadUrl` and `expiresAt` (48 hours after completion) are set, and status moves to `READY`. A failed collection sets `status: FAILED` with no partial file left behind.
- `GET /users/me/export/:jobId` returns the job owned by the caller only (`404` for another user's job id, same existence-hiding pattern as `docs/features/message-reports.md`); once `expiresAt` passes, the endpoint still returns the job metadata but `downloadUrl` is omitted and the stored file is deleted by the same grace-period-style sweep.

### Client

- Settings gains an "Account" danger-zone section: "Delete my account" (password + optional 2FA code form, a confirmation restating the grace period and that owned servers block it, and after success a persistent banner "Your account will be deleted on <date> — Cancel"), and "Download my data" (password form, then a job status: Preparing / Ready with a download link / Failed with retry).
- New strings (danger-zone copy, confirmation, job statuses) go into `apps/web/src/i18n/locales/en.ts` and `vi.ts`.

## Technical Approach

### Data model

```prisma
model User {
  // ...existing fields
  deletionRequestedAt DateTime?
  deletionScheduledAt DateTime?
  deletionCompletedAt DateTime?
}

enum ExportJobStatus {
  PENDING
  READY
  FAILED
}

model ExportJob {
  id          String          @id @default(cuid())
  userId      String
  status      ExportJobStatus @default(PENDING)
  downloadUrl String?
  errorMessage String?
  expiresAt   DateTime?
  createdAt   DateTime        @default(now())
  completedAt DateTime?
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

Migration `20260917004000_add_account_deletion_and_export`. All three `User` columns are additive and nullable — no backfill, no lock concern on the populated `User` table.

### API

| Method | Path                      | Body                  | Response                                                       | Rate limit |
| ------ | ------------------------- | --------------------- | -------------------------------------------------------------- | ---------- |
| `POST` | `/users/me/delete`        | `{ password, code? }` | `{ ok: true, scheduledAt }`                                    | 5/15min    |
| `POST` | `/users/me/delete/cancel` | —                     | `{ ok: true }`                                                 | 10/min     |
| `POST` | `/users/me/export`        | `{ password }`        | `202 { jobId }`                                                | 3/24h      |
| `GET`  | `/users/me/export/:jobId` | —                     | `{ job: { id, status, downloadUrl?, expiresAt?, createdAt } }` | default    |

### Realtime

- `user:account-deleted` `{ userId }` to every `server:<id>` the user belonged to at anonymization time, so member lists update without a refetch (`rules/workflow.md`/`RULE.md` realtime rules: persist first, emit second — the anonymization transaction commits before this emits).

### Files

- API: `modules/users/account-deletion.service.ts` (request/cancel/sweep), `account-deletion-sweep.service.ts` (the interval, modeled on `realtime-heartbeat.service.ts:32-39`), `modules/users/export.service.ts`, `users.controller.ts`, `dto/delete-account.dto.ts`, `dto/export-account.dto.ts`, `auth/sessions.service.ts` (extend to a `revokeAll(userId)` used by both "revoke others" future reuse and deletion), `uploads/uploads.service.ts` (reuse `buildStorageKey`/driver, no change expected beyond a new key prefix), `prisma/schema.prisma`, `app.module.ts`.
- Web: `api.ts`, `hooks/useAccountDeletion.ts`, `hooks/useAccountExport.ts`, `components/settings/AccountDangerZoneSection.tsx`, `ProfileSettings.tsx` or `AccountSecuritySettings.tsx` (wherever the danger zone is placed — see Open Questions), `i18n/locales/en.ts`, `vi.ts`.

## Trade-offs

- **Anonymize-in-place vs. hard `DELETE`**: a hard delete is not possible without either (a) a data migration adding `onDelete: SetNull`/`Cascade` to eight required relations, which would also change what happens to `Message.author`, `AuditLog.actor`, etc. on every future account deletion and is a schema-wide decision bigger than this feature, or (b) cascading the delete through to a user's entire message history, which destroys other members' conversation context and audit trail integrity. Anonymizing keeps every FK valid with zero schema relation changes beyond three additive columns. Cost: a "deleted" account's row is permanent, which is disclosed to the user in the confirmation copy.
- **14-day grace period + async sweep vs. immediate deletion**: matches the acceptance criterion that deletion is recoverable, and reuses the sweep pattern already proposed in `docs/features/saved-messages.md` rather than introducing a queue; cost is the same double-delivery caution that doc calls out — the claim step must be a conditional `UPDATE`, not read-then-write.
- **In-request synchronous export vs. a background job/queue**: no queue infrastructure exists in this repository (confirmed above); running collection synchronously in the request handler is simplest for a first slice but risks the request/timeout-interceptor window (`rules/backend-nestjs.md`: "a global timeout interceptor sits outside the transaction... keep mutating handlers short") for a user with a very large message history. This is flagged as a real risk, not silently accepted — see Risks & Rollback. The alternative (a proper job queue) is the correct end state once export volume justifies the new dependency.
- **Export needs only password, not 2FA**: deletion is destructive and irreversible after the grace period, so it gets the same two-factor bar as disabling 2FA itself; export is read-only and reversible (nothing changes), so the extra friction is judged not worth it. This is a deliberate asymmetry, called out so a reviewer does not read it as an oversight.
- **Cross-server audit gap**: `AuditLog` is `serverId`-scoped by schema (`schema.prisma:502`, required field) and account deletion is not a single-server event, so it cannot use `writeAuditLog` without picking one arbitrary server or duplicating the entry across every server the user belonged to (which would pollute every server's audit log with an unrelated account event). Logging to the application logger only is the smaller compromise; a dedicated account-level audit table is a larger, separate feature.

## Risks & Rollback

- **Risk**: synchronous export collection for a prolific user could run long enough to hit the global request timeout; needs a measured message-count ceiling or a follow-up move to a background job before this ships to accounts with very large history. Called out here rather than assumed safe.
- **Risk**: the owned-servers block only checks at request time and again at sweep time; a user could create a new server in the narrow window between those checks if login were somehow still possible — mitigated by revoking all sessions at request time, which the design already does, closing that window.
- **Risk**: `deletionScheduledAt` anonymization is irreversible past cancellation; a bug in the sweep's claim query double-running the transaction is guarded by the conditional `UPDATE ... WHERE anonymizedAt IS NULL` pattern, but this needs the same review `docs/features/saved-messages.md` flags for its own sweep.
- **Rollback**: revert code; the migration is additive. A user mid-grace-period at rollback time simply never gets swept (their `deletionScheduledAt` sits unused) until the feature is redeployed.

## Test Plan

- **Manual**: user with no owned servers requests deletion with correct password → sees the scheduled-deletion banner → cancels → banner disappears and login still works.
- **Manual**: user who owns a server requests deletion → `409` with a message pointing at server ownership; after transferring the server, the same request succeeds.
- **Manual**: (requires moving the sweep interval down for a test run, or backdating `deletionScheduledAt` in a local dev database) the sweep anonymizes the row → the user's old messages still render with `"Deleted User"` as the author, and the account can no longer log in.
- **Manual**: user requests an export → job goes `PENDING` → `READY` with a download link → downloaded JSON contains the user's own messages and no password hash or session tokens.
- **Failure case**: user submits deletion with a wrong password → `400 Invalid password or code`, nothing scheduled.

## Deployment Notes

- Run migration `20260917004000_add_account_deletion_and_export` before deploying the API.
- New env var, if `UploadsService`'s existing `STORAGE_DRIVER`/`CLOUDINARY_*` config is reused as expected: none required beyond what uploads already needs; add an entry to `.env.example` only if a distinct export bucket/prefix is introduced.
- The grace-period and export-expiry sweeps start with the API process, same as `RealtimeHeartbeatService` — no separate worker deploy.
- Add the new account-deletion/export strings to `en.ts` and `vi.ts` and run `npm run i18n:check`.

## Open Questions

See `docs/features/open-questions.md` — this doc could not resolve from the code: which Settings section owns the new danger zone (`AccountSecuritySettings.tsx` vs. `ProfileSettings.tsx`), and whether synchronous in-request export collection is acceptable long-term or must be scoped down (e.g. a hard cap on exported message count) before implementation starts.
