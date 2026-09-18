# Feature Spec: Server Ownership Lifecycle (Leave, Transfer, Delete)

- **Status**: implemented 2026-09-18 (approved the same day); see Deviations
- **Date**: 2026-09-18
- **Related**: `open-questions.md` (closed rows 30, 38), `member-bans.md`, `stage-channels.md`,
  `upload-ownership.md`, `qa-follow-ups-2026-09-18.md`

Adds a voluntary "leave server" for members, plus ownership transfer and server deletion for
owners, closing open questions 30 and 38.

## Goal

Today a member can never leave a server on their own, and an owner can never stop owning one
except by never signing in again. Account deletion refuses to run for an account that owns a
server (`apps/api/src/modules/users/account-deletion.service.ts:174-177`,
`apps/api/src/modules/users/account-anonymization.ts:39-40`) and nothing in the API lets that
owner fix the situation. This doc adds the three missing operations so an owner has a real path
to deleting their account.

Acceptance criteria:

- `DELETE /servers/:serverId/members/me` removes the caller's own membership, running the same
  stage cleanup and call-ending steps as kick/ban; the owner gets `403` and a message that points
  at transfer or delete.
- `POST /servers/:serverId/transfer` moves ownership to another human member; the old owner keeps
  their (now ordinary) membership. Only the current owner can call it.
- `DELETE /servers/:serverId` deletes the server and everything that belongs to it, including its
  uploaded emoji/sticker/soundboard files. Only the current owner can call it.
- Every other open client of the server drops it immediately (leave, transfer, and delete all
  update or remove the sidebar entry without a reload).
- `account-deletion.service.ts`'s "owns a server" refusal message names these two actions.

## Scope

**In scope**

- `DELETE /servers/:serverId/members/me` for members (non-owners).
- `POST /servers/:serverId/transfer` for the owner, target must be a human (`UserKind.HUMAN`)
  member.
- `DELETE /servers/:serverId` for the owner, hard delete with upload cleanup.
- Realtime events so other clients update without a refetch.
- Audit log entries for transfer and delete (delete's own audit trail is dropped with the
  cascade, so it is logged to the actor's own record instead — see Changes).
- Re-auth (password, plus 2FA code when enabled) before transfer and delete, matching the account
  deletion pattern.
- i18n catalog entries (en/vi) for every new error message.
- Wording update to the existing "owns a server" refusal in account deletion.

**Out of scope**

- Deleting the account in the same request as transfer/delete (the user still calls account
  deletion separately afterward).
- A "type the server name to confirm" UI flow for delete (see Trade-offs).
- Soft-delete / undo window for a deleted server (see Trade-offs).
- Role hierarchy or any other moderation change.
- Changing what happens to a bot the owner also owns; bot removal on leave/transfer is unaffected
  because the bot is a separate `User`/`ServerMember` row, not the human owner's.

## Current behavior

- `ServersController` has no leave, transfer, or delete route today — confirmed by reading every
  route in `apps/api/src/modules/servers/servers.controller.ts:1-166`: only `create`, `listMine`,
  `getOne`, `update`, onboarding routes, audit logs, `updateMyMembership`, `removeMember` (kick),
  `timeoutMember`, bans, invites, and `joinInvite`.
- Kick (`apps/api/src/modules/servers/server-moderation.service.ts:38-65`): requires
  `Permission.KickMembers`, refuses the owner (`:49`) and self (`:50`), then in one transaction
  deletes the `ServerMember` row and calls `deleteMemberStageRows` (`:52-55`,
  `apps/api/src/modules/stage/stage-member-cleanup.ts:13-29`), writes an audit log
  (`:56-60`), calls `announceRemoval` (`:61`), and calls `this.stage.afterMemberRemoved` (`:62`).
- `announceRemoval` (`server-moderation.service.ts:185-210`) emits `server:member-removed`
  `{ serverId, userId, reason }` to `serverRoom(serverId)` and `userRoom(removedUserId)`
  (`:190-195`), removes the user's sockets from the server room and every channel room
  (`:196-202`), syncs the bot gateway if the removed user is a bot
  (`:205`, `apps/api/src/modules/bots/bot-gateway-sync.ts:11-26`), and calls `endCalls`
  (`:206-209`), which drops the user from `CallRegistryService` and, under
  `VOICE_TRANSPORT=livekit`, removes them from the channels' LiveKit rooms
  (`server-moderation.service.ts:216-229`).
- Ownership is stored as `Server.ownerId` (`apps/api/prisma/models/servers.prisma:12`, a plain
  `String`, FK to `User` via the `owner` relation `:28`) and mirrored on the member row as
  `ServerMember.kind = 'OWNER'` (`servers.prisma:1-5, 122`). `PermissionsService.requireServerPermission`
  treats `member.kind === 'OWNER'` as having every permission
  (`apps/api/src/modules/permissions/permissions.service.ts:32-38`); kick/ban/timeout each also
  check `target.kind === 'OWNER'` or `server.ownerId === target.id` directly to refuse acting on
  the owner (`server-moderation.service.ts:49, 75, 132`). Nothing in the codebase currently writes
  a second `ServerMember` row with `kind: 'OWNER'` for the same server, and nothing changes
  `Server.ownerId` after creation (not found by grep across `apps/api/src/modules/servers/*.ts`).
- `Server`'s children mostly cascade already: `members`, `roles`, `channels`, `invites`,
  `notificationPreferences`, `auditLogs`, `bans`, `channelCategories`, `emojis`, `stickers`,
  `soundboardClips`, `events`, `messageReports`, `autoModRules`, `templates`, `webhooks` all use
  `onDelete: Cascade` back to `Server` (`apps/api/prisma/models/servers.prisma:59,77,97,110,130,147,176,203,221`,
  `apps/api/prisma/models/webhooks.prisma:15`, `apps/api/prisma/models/bots.prisma:37`,
  `apps/api/prisma/models/moderation.prisma:36,82`, `apps/api/prisma/models/discovery.prisma:52`,
  `apps/api/prisma/models/notifications.prisma:12`, `apps/api/prisma/models/channels.prisma:15,36`).
  `ServerReport.sourceServer` (`discovery.prisma:24`) and `ServerEvent.channel`
  (`servers.prisma:177`) use `SetNull` instead, so deleting a server never blocks on those.
  `Server.owner` has no `onDelete` clause (`servers.prisma:28`), which is irrelevant here since
  this feature deletes the `Server`, never the `User`.
- Stored files for emoji, sticker, and soundboard rows are **not** cleaned up by cascade: each row
  owns a unique, server-generated upload key and is deleted with its own explicit
  `removeStoredFileQuietly(url, mimeType)` call today, e.g.
  `apps/api/src/modules/stickers/stickers.service.ts:113-129`
  (confirmed pattern for the other two by `docs/features/upload-ownership.md:26`). A cascaded
  `Server` delete would remove the `ServerEmoji`/`ServerSticker`/`SoundboardClip` **rows** but leave
  their files on disk/Cloudinary forever, since Postgres cascade never calls application code.
- `stage-channels.md:190-201` already recorded, on 2026-09-18, that no voluntary leave endpoint
  exists and named this doc (`server-ownership-lifecycle.md`) as where it would land, with the
  same `StageSpeaker`/`StageSpeakRequest` cleanup requirement as kick/ban.
- `AccountDeletionService.assertNoOwnedServers` throws
  `ConflictException('Transfer or delete your owned servers first')`
  (`apps/api/src/modules/users/account-deletion.service.ts:174-177`), called from `requestDeletion`
  (`:61`) before spending the re-auth check. `anonymizeAccount` re-checks the same condition inside
  its transaction and returns `{ status: 'OWNS_SERVERS' }`
  (`apps/api/src/modules/users/account-anonymization.ts:38-40`); `completeDeletion` only logs a
  warning for that case and does nothing else
  (`apps/api/src/modules/users/account-deletion.service.ts:130-133`).
- Re-auth pattern already exists: `TwoFactorService.verifyReauthentication(userId, password, code,
{ requireSecondFactor })` (`apps/api/src/modules/auth/two-factor.service.ts:171-192`) checks the
  password with bcrypt and, when the account has 2FA enabled, consumes an authenticator or recovery
  code; both failures answer the same `BadRequestException('Invalid password or code')`. It is
  already reused by `AccountDeletionService.requestDeletion` (`account-deletion.service.ts:61-64`).
- `UserKind` is `HUMAN | WEBHOOK | BOT` (`apps/api/prisma/models/users.prisma:11-15`). Ban already
  distinguishes them: a webhook's synthetic user cannot be banned, only `HUMAN`/`BOT` targets are
  accepted (`server-moderation.service.ts:122-127`).
- Web: kick and ban controls live in server settings' member moderation section
  (`member-bans.md` Files: `MemberModerationSection.tsx`, `MemberRolesSettings.tsx`); there is no
  "Leave Server" or "Delete Server" control anywhere in `apps/web/src` today — grepped for
  `Leave Server`, `leaveServer`, `Delete Server`, `deleteServer`, `Transfer Ownership`,
  `transferOwnership` across `apps/web/src`, `apps/api/src`, and `packages/shared/src`: no matches.
  `ServerSettings.tsx:1-40` lists the settings sections (bans, emoji, soundboard, stickers,
  discovery, onboarding, templates, reports, audit log) with no danger-zone section; that is where
  Transfer and Delete land (owner-only, see Changes).

## Changes

### Rules / Flow

1. **Leave** (`DELETE /servers/:serverId/members/me`):
   - Requires membership (`PermissionsService.requireMembership`); no permission bit needed —
     leaving needs no grant.
   - The current owner (`member.kind === 'OWNER'`) gets `403` with
     `'Transfer ownership or delete the server before leaving'`.
   - Otherwise: in one transaction, delete the caller's own `ServerMember` row and call
     `deleteMemberStageRows(tx, serverId, userId)`, exactly like kick.
   - Write audit log action `MEMBER_LEAVE` with `{ userId, username, displayName }`, actor = the
     leaving user themselves (kick/ban's `actorId` is the moderator; here actor and target are the
     same user — consistent with how the audit log already has no constraint requiring a different
     actor and target).
   - Call the same `announceRemoval(serverId, userId, 'LEAVE')` used by kick/ban, and
     `this.stage.afterMemberRemoved(userId, removedStageRows)`.
   - A bot cannot call this route (bots authenticate through the bot gateway, not `JwtAuthGuard`
     user sessions) — no special-casing needed.
2. **Transfer** (`POST /servers/:serverId/transfer`, body `{ userId, password, code? }`):
   - Requires the caller to be the current owner (`member.kind === 'OWNER'`); anyone else gets
     `403 Only the owner can transfer this server`.
   - Re-auth: `twoFactor.verifyReauthentication(callerId, password, code, { requireSecondFactor:
true })`, the same call `AccountDeletionService.requestDeletion` makes
     (`account-deletion.service.ts:62-64`). Ownership is powerful enough (it grants every
     permission and the ability to delete the server) to warrant the same proof as deleting the
     account.
   - Target must be a **different**, existing `ServerMember` of this server whose `user.kind ===
'HUMAN'`. A bot or webhook target gets `400 Cannot transfer ownership to a bot or webhook`;
     the caller themself gets `400 You already own this server`; a non-member id gets
     `404 Member not found`.
   - In one transaction: update `Server.ownerId` to the target's user id, set the target's
     `ServerMember.kind` to `OWNER`, and set the caller's own `ServerMember.kind` to `MEMBER`. The
     caller keeps their row (with whatever roles they held) and simply stops being the owner —
     matching how kick/ban never touch the owner's roles, only their `kind`.
   - Write audit log action `SERVER_OWNERSHIP_TRANSFER` with
     `{ fromUserId, toUserId, toUsername }`.
   - Emit `server:ownership-transferred` `{ serverId, fromUserId, toUserId }` to
     `serverRoom(serverId)`, so every open client updates who can see owner-only UI (the danger
     zone, and the "you are the owner" badge) without a refetch.
3. **Delete** (`DELETE /servers/:serverId`, body `{ password, code? }`):
   - Requires the caller to be the current owner; anyone else gets
     `403 Only the owner can delete this server`.
   - Re-auth with the same `verifyReauthentication` call as transfer.
   - Before the delete transaction: read the ids/urls/mimeTypes needed for file cleanup —
     `ServerEmoji`, `ServerSticker`, and `SoundboardClip` rows of the server (`{ url, mimeType }`
     each), and the server's own `avatarUrl` (present in the schema but never set by any endpoint
     today per `upload-ownership.md:27,38`; included for completeness in case it is set by a future
     feature or a manual DB edit).
   - In one transaction: snapshot the member ids and channel ids of the server (for the realtime
     step below, since they disappear with the cascade), then `prisma.server.delete({ where: {
id: serverId } })`. Every cascading child listed in Current behavior is removed by Postgres in
     the same statement. No new audit log row is written inside the transaction — `AuditLog`
     cascades with the server (`servers.prisma:203`), so a row written and immediately deleted by
     the same statement would be pointless.
   - After the transaction commits: call `uploads.deleteUploadIfUnreferenced`-equivalent cleanup —
     for emoji/sticker/soundboard, call the existing `removeStoredFileQuietly(url, mimeType)` for
     each row read above (best-effort, logged on failure, same pattern as
     `stickers.service.ts:129`); the server's own `avatarUrl`, if not null, goes through
     `uploads.deleteUploadIfUnreferenced` since it can share a URL with a user avatar/banner
     (`upload-ownership.md` Rule 5, 8).
   - Emit `server:deleted` `{ serverId }` to `serverRoom(serverId)` and to every removed member's
     `userRoom(userId)` (covers a member whose socket had already left the server room, e.g. a
     stale tab), then `removeUsersFromRooms` for the server room and every channel room, mirroring
     `announceRemoval`. End every active call in the server's channels the same way `endCalls` does
     for kick/ban (registry removal plus LiveKit room removal per channel), for every member who
     was in one, not just one user — the same LiveKit failure handling (log and continue) applies.
   - A separate audit trail entry is written to a table that survives the server, so the deletion
     itself is not lost: **open question**, see Open Questions below — no such table exists today
     (`AuditLog` is server-scoped only); logging with `Logger.warn` on the API process is the
     fallback used meanwhile, matching how `completeDeletion` already logs
     `OWNS_SERVERS` (`account-deletion.service.ts:131`).
4. **Account deletion wording**: `AccountDeletionService.assertNoOwnedServers`
   (`account-deletion.service.ts:174-177`) message changes from
   `'Transfer or delete your owned servers first'` to a version that names the new actions, e.g.
   `'Transfer ownership or delete each server you own before deleting your account'` — same
   `ConflictException`, no status-code change. This is the smallest change that answers the
   Scope's stated intent without adding a link or client-side deep-link (out of scope: the client
   already routes the user to server settings by hand).

### Edge cases

| Case                                                            | Expected behavior                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Owner calls leave                                               | `403 Transfer ownership or delete the server before leaving`                                          |
| Non-owner calls transfer or delete                              | `403 Only the owner can transfer this server` / `403 Only the owner can delete this server`           |
| Transfer target is a bot or webhook                             | `400 Cannot transfer ownership to a bot or webhook`                                                   |
| Transfer target is the caller                                   | `400 You already own this server`                                                                     |
| Transfer target is not a member                                 | `404 Member not found`                                                                                |
| Wrong password or missing/invalid 2FA code on transfer/delete   | `400 Invalid password or code` (same message as account deletion, does not reveal which check failed) |
| Delete a server with active voice calls                         | Every participant's call ends the same way kick/ban ends one member's call, for all of them           |
| Delete a server with emoji/sticker/soundboard files             | DB rows go with the cascade; files are removed best-effort after commit                               |
| Leave/transfer/delete on a server the caller is not a member of | `403 You are not a member of this server` (existing `requireMembership` behavior)                     |
| Duplicate delete (already deleted, e.g. two tabs)               | Second call gets `404` from `findUniqueOrThrow`/an existence check before the transaction             |

## Technical approach

**Files touched**

| File                                                                                       | Change                                                                                                               |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/servers/server-moderation.service.ts`                                | Add `leave`; `announceRemoval` accepts `'LEAVE'` as a third `RemovalReason`.                                         |
| `apps/api/src/modules/servers/servers.service.ts` (or a new `server-ownership.service.ts`) | Add `transferOwnership`, `deleteServer`.                                                                             |
| `apps/api/src/modules/servers/servers.controller.ts`                                       | New routes: `DELETE /servers/:serverId/members/me`, `POST /servers/:serverId/transfer`, `DELETE /servers/:serverId`. |
| `apps/api/src/modules/servers/dto/transfer-server.dto.ts`, `dto/delete-server.dto.ts`      | New DTOs, `{ userId, password, code? }` and `{ password, code? }`, mirroring `dto/delete-account.dto.ts`.            |
| `apps/api/src/modules/servers/servers.module.ts`                                           | Wire `TwoFactorService`, `UploadsService` if not already imported.                                                   |
| `apps/api/src/modules/users/account-deletion.service.ts`                                   | Reworded `assertNoOwnedServers` message.                                                                             |
| `apps/api/src/common/i18n/error-codes.ts`                                                  | New entries for every new literal error message above.                                                               |
| `apps/web/src/i18n/locales/{en,vi}/servers.ts`                                             | New keys for the danger-zone UI and the reworded account-deletion refusal.                                           |
| `apps/web/src/components/settings/ServerSettings.tsx`                                      | New "Danger zone" section: Leave (non-owner), Transfer (owner, member picker), Delete (owner, re-auth dialog).       |
| `apps/web/src/hooks/useServerModeration.ts` (or the settings actions hook)                 | Subscribe to `server:ownership-transferred` and `server:deleted`; call the three new endpoints.                      |
| `apps/web/src/api.ts`                                                                      | New client calls and response types.                                                                                 |

**API contract**

- `DELETE /servers/:serverId/members/me`
  - Request: none.
  - Response `200`: `{ ok: true }`.
  - Errors: `403` owner tries to leave · `403` not a member.
- `POST /servers/:serverId/transfer`
  - Request: `{ userId: string, password: string, code?: string }`.
  - Response `200`: `{ server }` (same shape `updateServer` returns today).
  - Errors: `400` invalid password/code · `400` target is a bot/webhook · `400` target is the caller ·
    `403` caller is not the owner · `404` target is not a member.
- `DELETE /servers/:serverId`
  - Request: `{ password: string, code?: string }`.
  - Response `200`: `{ ok: true }`.
  - Errors: `400` invalid password/code · `403` caller is not the owner · `404` server already
    deleted.

**DB / migration**

None. `Server.ownerId` and `ServerMember.kind` already exist and already support being written
(kick/ban already write `ServerMember.kind` indirectly by deleting rows; `updateServer` already
writes other `Server` columns). Transfer only needs an `UPDATE` on two existing columns; delete
only needs the existing cascades. No new table, column, or index.

**Libraries** — none added; reuses `TwoFactorService`, `UploadsService`, and the existing Prisma
client.

## Trade-offs

| Option                                                                                  | Pros                                                                                                                                                                                                                                                                                                               | Cons                                                                                                                                                                                                                                                                                           | Verdict                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hard delete on `DELETE /servers/:serverId` (chosen)**                                 | Matches how the rest of the schema already cascades from `Server`; no new "soft-deleted but still occupying uniqueness/slots" state to filter out everywhere (`Server.deletedAt` already exists but is used only for discovery delisting, not member-facing deletion — reusing it here would overload its meaning) | Not reversible; a mistaken delete cannot be undone                                                                                                                                                                                                                                             | Chosen: the codebase has no soft-delete pattern for a fully removed server, and adding an undo window is a separate, larger feature (grace period, sweep job, "restore" UI) the product owner did not ask for |
| Soft delete (`deletedAt`) with a background sweep, like account deletion's grace period | Recoverable within a window; consistent with account deletion's own pattern                                                                                                                                                                                                                                        | `Server.deletedAt` already means "delisted from discovery" (`servers.prisma:13,19,48`); reusing it for "gone" would make every other query that reads a server (channels, messages, calls) need a `deletedAt IS NULL` check it does not have today, a much larger change than this doc's scope | Ruled out for this slice; could be proposed later as its own doc if data-loss risk becomes a real complaint                                                                                                   |
| Require typing the server name to confirm delete (Discord's own UX)                     | Extra friction against accidental deletion                                                                                                                                                                                                                                                                         | The codebase's own account-deletion flow uses password + 2FA as its only confirmation (`DeleteAccountDto`), not a typed name; adding a second, different confirmation pattern here is inconsistent and this doc already requires the same re-auth                                              | Ruled out: password + 2FA re-auth is the existing bar for "destroy something owned by this account," reused as-is                                                                                             |
| Reuse `ManageServer` permission for transfer/delete instead of owner-only               | Lets an owner delegate via roles                                                                                                                                                                                                                                                                                   | `ManageServer` already lets a non-owner edit most server settings; delegating delete/transfer to it would let an admin who is not the owner delete or steal the server, and the codebase has no role hierarchy (`member-bans.md` Trade-offs) to prevent that                                   | Ruled out: strictly owner-only, matching how kick/ban already refuse to target the owner regardless of the actor's permissions                                                                                |

What the chosen option costs: hard delete means no operator recovery path beyond a database
backup; the re-auth requirement adds one extra round trip (password + optional 2FA) to an
already-rare action, matching the cost account deletion already accepted.

## Risks & rollback

- **What can break**: a server deleted while members are mid-action (sending a message, creating a
  channel) races the cascade; those in-flight writes fail with an FK error surfaced as a generic
  500, same class of race `member-bans.md`'s "Concurrent request" edge case already accepts for
  smaller cases.
- **Not covered**: an audit trail entry for the delete itself that survives the server (see Open
  Questions); undo/restore of a deleted server; transferring ownership of more than one server at
  once (the account-deletion flow still requires the owner to transfer/delete each server one at a
  time).
- **Rollback**: revert the code; no migration to roll back. A server already deleted by this
  feature cannot be restored by reverting code — only from a database backup, same as any other
  hard delete in this codebase.

## Test plan

The repository keeps no automated tests (`RULE.md`). Verify with `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run docs:check`. Manual scenarios:

1. Member A (not owner) calls `DELETE /servers/:id/members/me` → `200`; A's client returns Home
   with a notice, like the kick flow; other members see A disappear from the member list; if A was
   in a stage speak-request queue or holding a speaker slot, the row is gone and other clients'
   stage roster updates.
2. Owner calls the same route → `403 Transfer ownership or delete the server before leaving`.
3. Owner calls `POST /servers/:id/transfer` with a correct password (and 2FA code if enabled)
   targeting member B (human) → `200`; B is now the owner (owner-only UI appears for B, disappears
   for the old owner in both open clients without a reload); old owner keeps their membership and
   prior roles.
4. Transfer with a wrong password → `400 Invalid password or code`, ownership unchanged.
5. Transfer targeting the server's bot member → `400 Cannot transfer ownership to a bot or webhook`.
6. Transfer targeting a user id that is not a member of the server → `404 Member not found`.
7. Non-owner (including one with `MANAGE_SERVER` from a role) calls transfer or delete →
   `403 Only the owner can transfer/delete this server`.
8. Owner deletes a server that has custom emoji, a sticker, and a soundboard clip, and an active
   voice call with two other members → `200`; both members' clients drop the server from the rail
   and their call ends; a follow-up request for the server's emoji list returns `404`; the emoji's
   uploaded file is gone from storage (checked in the uploads directory/Cloudinary dashboard, not
   just the DB row).
9. Owner successfully transfers, then account-deletes their own account (now a plain member) →
   `requestDeletion` no longer refuses on `assertNoOwnedServers`.
10. Owner tries to delete their account while still owning a server → `409` with the reworded
    message naming transfer/delete.

## Deployment notes

- No new env vars.
- No migration.
- No cache/queue to clear.
- Breaking API change: none (all three routes are new); no frontend/backend coordinated deploy
  required beyond shipping both together for the danger-zone UI to have something to call.

## Deviations From The Original Design

Written back after implementing, so the doc matches the code:

- **Emoji files are not deleted with the server.** The draft said emoji rows own a
  server-generated file removed with `removeStoredFileQuietly`. They do not: `ServerEmoji` has no
  `mimeType` column (`apps/api/prisma/models/servers.prisma:52-63`), its `url` is client-chosen
  (`apps/api/src/modules/emojis/emojis.service.ts:51-53`), and deleting one emoji never removes a
  file (`emojis.service.ts:67-75`). Server delete therefore removes sticker and soundboard files
  only, which is what deleting one of those already does.
- **Per-server member avatars are cleaned up too.** Besides `Server.avatarUrl`, every
  `ServerMember.avatarUrl` of the deleted server goes through `deleteUploadIfUnreferenced`, since
  those rows are tracked uploads (open question 36) and would otherwise be orphaned by the cascade.
- **`Server.deletedAt` is not the delist flag.** The Trade-offs table says it means "delisted from
  discovery". Delisting writes `listed: false`
  (`apps/api/src/modules/platform/platform-reports.service.ts`); nothing writes `deletedAt`, and
  reads such as `ServersService.getServerForUser` only filter on it. The hard-delete choice stands
  for the reason the same row gives: channel, message and call reads do not filter on it.
- **Second delete answers `403`, not `404`.** The caller's membership went with the cascade, so
  `requireMembership` refuses first (`You are not a member of this server`). `404 Server not found`
  remains for the race where the conditional `deleteMany` matches nothing.
- **Ending calls on delete.** `CallRegistryService.endCalls(callIds)` ends each call for everyone in
  it by reusing `removeUser`, and `LivekitService.deleteRooms` closes the rooms, instead of calling
  kick's per-user `endCalls` once per member (which would read every call once per member).
- **Service layout.** Transfer and delete live in a new
  `apps/api/src/modules/servers/server-ownership.service.ts`; leave is
  `ServerModerationService.leave`. DTOs are in `dto/server-ownership.dto.ts`. Both new routes and
  leave carry a `@RateLimit` (5, 5 and 10 per minute).
- **Route order.** `DELETE /servers/:serverId/members/me` is declared before the kick route, which
  would otherwise read `me` as a member id.
- **Web.** The actions live in `useServerModeration` (`leaveServer`, `transferOwnership`,
  `deleteServer`), and `ServerDangerZoneSection.tsx` renders at the bottom of server settings for
  every member: leave (with an inline confirm) for a member, transfer and delete for the owner.
  Leave and delete close the settings dialog. `server:deleted` and `server:ownership-transferred`
  are handled in the same hook; a `LEAVE` removal shows "You left …" instead of "You were removed".

### Verification

`typecheck`, `lint` (clean for repository sources; see the report), `build`, `i18n:check`,
`check:file-size`, `ui:scan` and `docs:check` pass. The API scenarios 1–7, 9-style ownership checks
and delete (without voice calls or files) were run against a local API and database: 26/26 checks
passed, including the audit rows `MEMBER_LEAVE` and `SERVER_OWNERSHIP_TRANSFER`. Not run: the browser
flows (danger-zone UI, other tabs dropping the server live), deleting a server with an active call
or with sticker/soundboard files, and a 2FA-enabled account.
