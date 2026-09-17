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

## Deviations From The Original Design

Written back after implementation, so the doc matches the code. Line numbers below refer to the schema and code after this change.

### Decisions and changes

- Migration is `20260917007000_add_account_deletion_and_export`, not `20260917004000_...` (that timestamp is taken by scheduled messages). It also adds `User_deletionScheduledAt_idx` for the sweep and `ExportJob_status_expiresAt_idx` for the expiry sweep.
- `ExportJob.downloadUrl` is replaced by `fileKey`, a private storage key. The view's `downloadUrl` is computed: the API path `/users/me/export/:jobId/download`, returned only while the job is `READY` and unexpired.
- **Exports are private.** `UploadsService` stores public files (the local driver writes into the statically served `uploads` directory, and Cloudinary URLs are public), so reusing it would make the archive readable by anyone holding the link. A new `PrivateFileStorageService` (`apps/api/src/modules/uploads/private-file-storage.service.ts`) follows the same `STORAGE_DRIVER` switch: the local driver writes outside the repository and the public directory (`PRIVATE_STORAGE_LOCAL_DIR`, default `<os tmpdir>/discord-clone-private`, mode `0600`), and the Cloudinary driver stores `authenticated` raw resources read back through a signed URL. The download route checks the owner and expiry and streams the file with `Cache-Control: no-store`.
- **Cancelling needs a public route.** Requesting deletion revokes every session and sign-in is refused during the grace period, so the authenticated `POST /users/me/delete/cancel` could never be called. It is replaced by `POST /auth/account-deletion/cancel` with `{ email, password }` (no second factor: cancelling only makes signing in possible again, and signing in still asks for it). Unknown email and wrong password both return `400 Invalid password or code`; a correct password on an account that is not scheduled returns `409 Account is not scheduled for deletion`; past `deletionScheduledAt` returns `409 Deletion already completed`. Rate limit 10 per 15 minutes per IP.
- **Sign-in is refused during the grace period** with `403 Account is scheduled for deletion`, checked in `AuthService.completeSignIn` (before the 2FA hand-off) and `AuthService.createSession` (`apps/api/src/modules/auth/auth.service.ts:110,235,263`), which every sign-in path goes through (password, 2FA, email verification, OAuth code exchange). It is reached only after the credentials were accepted. The web sign-in screen shows a "Cancel account deletion" button for that error code, which opens a small email and password form.
- **The "persistent banner" is not built**: the account is signed out immediately, so the Settings section shows the scheduled date once, with a "Sign out" button.
- **OAuth-only accounts** have an unusable random password (`apps/api/src/modules/auth/oauth/oauth-account.service.ts:146`). They set a password through "Forgot password?" first; the password field hint says so. No passwordless deletion path was added.
- Re-authentication is `TwoFactorService.verifyReauthentication` (`apps/api/src/modules/auth/two-factor.service.ts:171`), the checks of `disable` made reusable: the second factor is only consumed after the password matched. Deletion checks owned servers before re-authenticating, so a blocked request does not spend a one-time code.
- Session revocation happens inside the request transaction and sockets are disconnected after commit, the pattern of `PasswordResetService.resetPassword`, instead of a new `SessionsService.revokeAll`. Socket reconnects re-check the session row, so a revoked session cannot reconnect.
- **Rate limits** are counted per account in Redis (`account-deletion:<userId>` 5 per 15 minutes, `account-export:<userId>` 3 per 24 hours) in addition to the per-IP `@RateLimit` guard (delete 5 per 15 minutes, export 10 per hour). The export quota is counted only after the password check and the in-progress check pass.
- `GET /users/me/export` (latest job or `null`) was added so the Settings section can show the current status without a stored job id. A `PENDING` job older than 10 minutes is marked `FAILED` with `errorMessage: INTERRUPTED` on the next request; the web polls every 5 seconds while a job is `PENDING`.
- Export collection is capped (open question 18 kept the synchronous slice): 10,000 channel messages, 10,000 direct messages, 5,000 rows for every other list, oldest first, each list carrying `truncated: true` when cut. The archive is one JSON file named `discords-export-<date>.json`.
- The danger zone lives in `AccountSecuritySettings.tsx` (open question 19), as two components: `AccountDataExportSection.tsx` and `AccountDangerZoneSection.tsx`. Hooks are `useAccountExport.ts` and `useAccountDeletion.ts`; no new CSS module (they use `SettingsModal.module.css`).
- Constants live in `apps/api/src/modules/users/account-deletion.rules.ts`; the transaction steps in `account-anonymization.ts`; the timer in `account-sweep.service.ts` (one 60-second sweep handles both due deletions and expired exports); controllers are `account.controller.ts` and `account-deletion-cancel.controller.ts`.
- The claim is the `updateMany` on the `User` row inside the anonymization transaction (`deletionScheduledAt <= now AND deletionCompletedAt IS NULL`), so a failure rolls the claim back and the next tick retries. The transaction timeout is 60 seconds.
- An account that owns a server at sweep time is skipped with a warning on every tick until resolved. Ownership transfer does not exist in the API today, so this can only happen through a server created in the instant before the request revoked the sessions.
- `user:account-deleted` goes to every `server:<id>` room the account belonged to and to `user:<id>`; the web removes the member from the open server's roster (`useServerModeration.ts`). Group conversations are not notified live; they update on the next load.
- New translated API errors: `Account is scheduled for deletion`, `Account deletion is already scheduled`, `Account is not scheduled for deletion`, `Deletion already completed`, `Transfer or delete your owned servers first`, `An export is already in progress`, `Export not found` (also returned for an expired or failed job's download), `Invalid private file key`, `Private file could not be read`.

### Pending scheduled messages

At request time every `PENDING` `ScheduledMessage` of the account is set to `FAILED` with the new reason `ACCOUNT_DELETION` in the same transaction. The sweep's claim also requires `author.deletionRequestedAt IS NULL` (`apps/api/src/modules/scheduled-messages/scheduled-message-sweep.service.ts:120`), which closes the gap with a tick running concurrently. Cancelling the deletion does not restore those rows; the author sees them as failed and can schedule again. The only send that can still happen is one the sweep had already claimed (`SENDING`) before the request committed. At anonymization every `ScheduledMessage` row of the account is deleted.

### Relation audit and what happens to each table

Re-audited against `apps/api/prisma/schema.prisma`. "Cascade" and "Restrict" describe the foreign key; since the `User` row is never deleted, none of them fires, and every row below is handled explicitly.

| Table (relation, line)                                                                                                                                                                                                                                                          | FK on delete                    | At anonymization                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User` itself                                                                                                                                                                                                                                                                   | —                               | **Anonymized in place**: email, username, display name "Deleted User", unusable password hash, profile and status fields, locale, email verification and 2FA fields cleared, `status` `OFFLINE`, `deletionCompletedAt` set |
| `Session` (`:179`), `OAuthAccount` (`:129`), `OAuthLoginCode` (`:142`), `PasswordResetToken` (`:154`), `EmailVerificationToken` (`:113`), `TwoFactorRecoveryCode` (`:165`), `PushSubscription` (`:557`), `PushNotificationThrottle` (`:567`), `NotificationPreference` (`:540`) | Cascade                         | **Deleted**                                                                                                                                                                                                                |
| `ReadState` (`:523`), `DirectReadState` (`:717`), `ThreadParticipant` (`:471`), `ServerEventInterest` (`:391`)                                                                                                                                                                  | Cascade                         | **Deleted** (private per-user state)                                                                                                                                                                                       |
| `FriendRequest` requester/receiver (`:613-614`), `UserBlock` blocker/blocked (`:624-625`)                                                                                                                                                                                       | Cascade                         | **Deleted** in both directions, so the account leaves friend and block lists                                                                                                                                               |
| `Notification.user` (`:736`)                                                                                                                                                                                                                                                    | Cascade                         | **Deleted**                                                                                                                                                                                                                |
| `Notification.actor` (`:737`)                                                                                                                                                                                                                                                   | SetNull                         | **Deleted**: other users' inbox items whose `title` embeds this account's display name                                                                                                                                     |
| `ServerMember` (`:245`), with `MemberRole` and member `ChannelPermissionOverride` by their own cascade                                                                                                                                                                          | Cascade                         | **Deleted** (leaves every server)                                                                                                                                                                                          |
| `DirectConversationMember` (`:650`)                                                                                                                                                                                                                                             | Cascade                         | **Group**: deleted; an empty group is deleted and an owned group passes to the longest-standing member. **One-to-one**: kept, so the other participant keeps the history                                                   |
| `DirectConversation.owner` (`:638`)                                                                                                                                                                                                                                             | SetNull                         | Reassigned as above                                                                                                                                                                                                        |
| `SavedMessage.owner` (`:766`)                                                                                                                                                                                                                                                   | Cascade                         | **Deleted** (private bookmarks)                                                                                                                                                                                            |
| `SavedMessage.snapshotAuthorId` / `snapshotAuthorName` (`:761-762`, no FK) in other users' bookmarks                                                                                                                                                                            | —                               | **Anonymized**: name set to "Deleted User"; snapshot content kept, like the message itself                                                                                                                                 |
| `Message.forwardOriginAuthorName` (`:426`), `DirectMessage.forwardOriginAuthorName` (`:666`), no FK                                                                                                                                                                             | —                               | **Anonymized** where the forward's source message was authored by the account (matched through the source id, raw parameterized SQL); a forward whose source row is gone cannot be matched and keeps the name              |
| `ScheduledMessage.author` (`:799`)                                                                                                                                                                                                                                              | Cascade                         | Failed at request time, **deleted** at anonymization                                                                                                                                                                       |
| `ExportJob.user` (`:912`)                                                                                                                                                                                                                                                       | Cascade                         | **Deleted**, and the stored files removed after commit                                                                                                                                                                     |
| `Message.author` (`:435`), `Thread.createdBy` (`:457`), `MessagePin.pinnedBy` (`:510`), `AuditLog.actor` (`:583`), `ServerEmoji.creator` (`:216`), `ServerBan.bannedBy` (`:230`), `ServerEvent.creator` (`:380`), `Poll.creator` (`:334`)                                       | Restrict (no clause)            | **Kept**, attributed to "Deleted User"                                                                                                                                                                                     |
| `DirectMessage.author` (`:673`)                                                                                                                                                                                                                                                 | Cascade (the spec implied none) | **Kept**; a hard delete would have removed the history other participants see                                                                                                                                              |
| `PollVote` (`:359`), `DirectMessageReaction` (`:706`), `MessageReaction.userId` (`:495`, no FK)                                                                                                                                                                                 | Cascade / —                     | **Kept**, so poll results and reaction counts other members see do not change                                                                                                                                              |
| `DirectMessageAttachment` (`:683`, via `DirectMessage`)                                                                                                                                                                                                                         | —                               | **Kept** with the direct message, including stored files                                                                                                                                                                   |
| `ServerBan.user` (`:229`)                                                                                                                                                                                                                                                       | Cascade                         | **Kept** (moderation history)                                                                                                                                                                                              |
| `MessageReport.reporter` (`:844`), `targetUser` (`:846`), `resolvedBy` (`:847`)                                                                                                                                                                                                 | Cascade / SetNull / SetNull     | **Kept** (moderation history), attributed to "Deleted User"                                                                                                                                                                |
| `AutoModRule.createdById` (`:886`), `Invite.creatorId` (`:594`), `DirectMessage.pinnedById` (`:662`), no FK                                                                                                                                                                     | —                               | **Kept**: an id only, no personal data; no AutoMod table is owned by a user                                                                                                                                                |
| `Server.owner` (`:193`)                                                                                                                                                                                                                                                         | Restrict                        | Blocks deletion while a non-deleted server is owned                                                                                                                                                                        |

Not removed: avatar and banner files already in upload storage. The URLs are cleared from the row, but `UploadsService` has no delete operation, and a Cloudinary public id would have to be derived from the URL; left as a follow-up.

### What the export contains

Profile (without password hash, 2FA secrets or recovery codes; `twoFactorEnabled` as a boolean), linked OAuth providers (provider and date, not provider account ids), server memberships (server name, nickname, joined date, rules acceptance date from [server-onboarding.md](server-onboarding.md), role names), the account's own non-deleted channel messages and direct messages (content, ids, timestamps, attachment metadata and URLs; a forward is marked `isForward` and never includes the forwarded snapshot, which is someone else's words), friend relationships and blocks (the other user's username and display name only), saved messages (snapshot text only when the account wrote it), scheduled messages, polls created and votes cast, reports filed (not reports about the account, nor who filed them), notification preferences, and push device names (not endpoints or keys). Other participants' direct-message content is never included. Sessions and tokens are not included.
Bots (added with [bot-api.md](bot-api.md)): while deletion is pending, the account's bots are refused by the bot token guard and cannot be authorized into servers. Anonymization deletes every owned bot, removes it from its servers (audited `BOT_REMOVE`) and emits `server:member-removed`. The export lists the account's bots (id, name, avatar, created date, username, servers) and never a token or its hash.

- **Cancel hardening (2026-09-17):** `POST /auth/account-deletion/cancel` now requires the authenticator or recovery `code` when 2FA is enabled, and is limited to 5 attempts per 15 minutes per email address on top of the per-IP limit. The export also includes `serverTemplates` and `serverReportsFiled`. See [wave-3-2-follow-ups.md](./wave-3-2-follow-ups.md).

## Risks & Rollback

- **Risk**: anonymization runs two `UPDATE`s over `Message` and `DirectMessage` filtered on `forwardedFrom*` columns, which have no index; on a large table each deletion scans both tables inside the transaction (60-second timeout). Accepted because deletions are rare; add partial indexes if the sweep log shows timeouts.
- **Risk**: an account blocked at sweep time (owns a server) is retried and warned about every minute, and a batch of 20 such accounts would starve later ones.
- **Risk**: the anonymized `deleted-<id>` username still resolves wherever the API looks users up by username (for example sending a friend request); nothing receives it, but the flows do not reject it explicitly.
- **Not verified**: the Cloudinary private storage path (`upload_stream`, signed `authenticated` URL, `destroy`) compiles against the SDK types but was not run against Cloudinary.
- **Risk**: synchronous export collection for a prolific user could run long enough to hit the global request timeout; needs a measured message-count ceiling or a follow-up move to a background job before this ships to accounts with very large history. Called out here rather than assumed safe.
- **Risk**: the owned-servers block only checks at request time and again at sweep time; a user could create a new server in the narrow window between those checks if login were somehow still possible — mitigated by revoking all sessions at request time, which the design already does, closing that window.
- **Risk**: `deletionScheduledAt` anonymization is irreversible past cancellation; a bug in the sweep's claim query double-running the transaction is guarded by the conditional `UPDATE ... WHERE anonymizedAt IS NULL` pattern, but this needs the same review `docs/features/saved-messages.md` flags for its own sweep.
- **Rollback**: revert code; the migration is additive. A user mid-grace-period at rollback time simply never gets swept (their `deletionScheduledAt` sits unused) until the feature is redeployed.

## Test Plan

No automated tests (`RULE.md`). None of these scenarios has been run yet.

- **Manual**: user with no owned servers requests deletion with the correct password → Settings shows the deletion date → every other device is signed out → signing in returns "Account is scheduled for deletion" with a "Cancel account deletion" button → cancelling with email and password shows the cancelled notice → signing in works.
- **Manual**: user with 2FA enabled requests deletion without a code, or with a wrong one → `400 Invalid password or code`; with a valid authenticator or recovery code → scheduled.
- **Manual**: user who owns a server requests deletion → `409 Transfer or delete your owned servers first`, no code consumed; after deleting the server, the same request succeeds.
- **Manual**: user with a pending scheduled message requests deletion → the row is `FAILED` with `ACCOUNT_DELETION` and is not posted when `sendAt` passes.
- **Manual**: (backdate `deletionScheduledAt` in a local dev database) within a minute the row is anonymized → old channel and direct messages render with "Deleted User" → the member disappears from the open server's member list → another user's saved bookmark and a forward of the user's message show "Deleted User" → friend and block lists no longer contain the account → the old email and password cannot sign in and cannot cancel.
- **Manual**: user requests an export → status shows Ready with a download → the downloaded JSON contains the user's own messages and none of: password hash, 2FA secret, session or refresh tokens, push keys, other participants' direct-message content, forwarded snapshot text.
- **Failure case**: another user's job id on `GET /users/me/export/:jobId` and on `/download` → `404 Export not found`; a download after `expiresAt` (backdate it) → `404`, and the file is removed within a minute.
- **Failure case**: a second export while one is `PENDING` → `409 An export is already in progress`; a fourth completed request within 24 hours → `429`.
- **Failure case**: user submits deletion with a wrong password → `400 Invalid password or code`, nothing scheduled.

## Deployment Notes

- Run migration `20260917007000_add_account_deletion_and_export` before deploying the API.
- New optional env var `PRIVATE_STORAGE_LOCAL_DIR` (local driver only; default `<os tmpdir>/discord-clone-private`). It must not be the public `uploads` directory, and on a multi-instance deployment with the local driver an export can only be downloaded from the instance that wrote it. With `STORAGE_DRIVER=cloudinary`, the existing `CLOUDINARY_*` settings are reused and exports are stored as `authenticated` raw resources under `<CLOUDINARY_FOLDER>/private/`.
- Deploy the API and web together: the web sign-in screen's cancel flow calls `POST /auth/account-deletion/cancel`.
- The grace-period and export-expiry sweeps start with the API process, same as `RealtimeHeartbeatService` — no separate worker deploy.
- Add the new account-deletion/export strings to `en.ts` and `vi.ts` and run `npm run i18n:check`.

## Open Questions

See `docs/features/open-questions.md` — this doc could not resolve from the code: which Settings section owns the new danger zone (`AccountSecuritySettings.tsx` vs. `ProfileSettings.tsx`), and whether synchronous in-request export collection is acceptable long-term or must be scoped down (e.g. a hard cap on exported message count) before implementation starts.
