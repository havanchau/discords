# DM Conversation Mute

- **Status**: draft — awaiting review
- **Date**: 2026-09-29
- **Related**: `docs/features/dm-push-notifications.md`, `docs/features/timed-notification-mute.md`, `docs/features/open-questions.md` (#41, #42), `docs/features/user-blocking.md`, `docs/features/group-dm.md`

## Goal

`docs/features/dm-push-notifications.md` made a direct message send a web push
(`apps/api/src/modules/direct-messages/direct-messages.service.ts:187`,
`apps/api/src/modules/push/push.service.ts:125-154`), gated only by the recipient's **global**
`NotificationPreference` row (`push.service.ts:249-261`). That closed `open-questions.md` #41's
blocker ("a DM mute would have no observable effect until DM push … exists" — row 41, verbatim) but
deliberately left per-conversation mute undesigned ("per-conversation mute itself stays a separate
follow-up", `dm-push-notifications.md:11`). This doc designs that follow-up: a user can mute one
specific DM conversation's push without muting every DM.

**Acceptance criteria**:

- [ ] `PATCH /direct-conversations/:conversationId/mute` lets a conversation member mute (for `15m`
      / `1h` / `8h` / `24h` / `forever`) or unmute that one conversation's push, reusing the same
      `isMuteActive`/expiry shape `timed-notification-mute.md` already introduced.
- [ ] Muting a conversation suppresses only the web push for messages sent in it; the existing
      in-app `Notification` row, unread count, and conversation-list ordering are unaffected.
- [ ] `GET /direct-conversations` returns each conversation's mute state so the client can render a
      muted indicator without an extra call per conversation.
- [ ] The mute applies identically to a 1-1 and a group conversation.
- [ ] A user who has muted DMs **globally** still sees no push for any conversation, muted or not
      (the two mutes are independent gates, either one suppresses).

## Scope

**In scope**

- A new per-user, per-conversation mute row, its migration, the `PATCH` endpoint, and its DTO.
- Extending `PushService.sendDirectMessagePush`'s gating to also check the conversation-level row.
- Returning the mute state on `GET /direct-conversations` without an N+1 query.
- A realtime signal so a second device of the same user picks up the change.
- Web: a mute control in the DM header, a muted indicator in the conversation list, i18n.

**Out of scope**

- Any change to the in-app `Notification` row DMs already create, or to unread-count behavior —
  Discord's own semantics (mute = no notification, still unread) are the chosen model here too (see
  Changes → Semantics), matching this repo's own precedent of keeping mute push-only for v1
  (`timed-notification-mute.md`, decided via `open-questions.md` #42).
- DM mention detection or a mention-bypasses-mute rule: DMs have no mention concept in this repo
  today (see Current behavior) — nothing to design around.
- Server- or channel-level mute changes; `timed-notification-mute.md`'s model, endpoint, and UI are
  untouched.
- A sweep/cron to flip an expired mute back to unmuted — same read-time `isMuteActive` pattern as
  the existing mechanism, no new job.
- Account-level "do not disturb" enforcement — the `User.status = 'DND'` value exists but nothing in
  `apps/api/src` branches on it for push suppression today (see Current behavior); left as a named
  gap, not fixed here.
- Rate-limiting DM push per conversation — `dm-push-notifications.md`'s Trade-offs already decided
  against reusing `PushNotificationThrottle` for DMs; unchanged by this doc.

## Current behavior

- `NotificationPreference` (`apps/api/prisma/models/notifications.prisma:1-19`) has no
  `conversationId` column — confirmed again while writing this doc (`grep -n conversationId
  apps/api/prisma/models/notifications.prisma` returns no match). This is the exact gap
  `open-questions.md` row 41 named.
- The existing mute shape, to be reused verbatim:
  - `isMuteActive(preference: { muted: boolean; mutedUntil: Date | null }, now: Date): boolean`
    (`apps/api/src/modules/users/notification-mute.ts:36-42`) — a pure function over any object with
    those two fields, already generic, not `NotificationPreference`-specific.
  - `resolveMutedUntil(duration: MuteDuration, now: Date): Date | null`
    (`notification-mute.ts:45-48`) — resolves the fixed duration set (`15m/1h/8h/24h/forever`,
    `packages/shared/src/api-contract.ts:198`) against the server clock.
  - Both are already imported by `PushService` (`push.service.ts:6`) for the existing global/server/
    channel mute checks.
- `PushService.sendDirectMessagePush` (`push.service.ts:125-154`) is the DM push entry point, called
  once per recipient from `DirectMessagesService.sendDirectMessagePushes`
  (`direct-messages.service.ts:190-214`), itself called once from `announceCreatedMessage`
  (`:187`) — the single call site on the send path.
- `PushService.shouldSendDirectMessagePush(userId)` (`push.service.ts:249-261`): returns `false` if
  the recipient's `User.status === 'ONLINE'`, otherwise loads only the recipient's **global**
  `NotificationPreference` row (`serverId: null, channelId: null`) and returns `false` if
  `desktopEnabled === false` or `isMuteActive(globalPreference, now)` — no conversation-scoped check
  exists yet, by design (there is nowhere to store one).
- `DirectMessagesService.announceCreatedMessage` (`direct-messages.service.ts:154-188`): after
  creating the message, marks the author's own read state, emits `dm:created` (`:162-169`), emits
  `dm:unread` counts per recipient (`:170`, → `emitDirectUnread`, `:273-288`), creates one in-app
  `Notification` row per recipient unconditionally (`:173-184`, no preference check at all), then
  calls `sendDirectMessagePushes` (`:187`) — the only step this doc's mute is allowed to touch.
- `DirectMessagesService.listConversations` (`:37-55`) batches unread counts with one grouped query,
  `countDirectUnread` (`apps/api/src/modules/messages/unread-counts.ts:29-45`), and attaches
  `unreadCount` per conversation in memory (`:49-52`) — the pattern to copy for attaching mute state
  without a per-conversation round trip.
- `DirectReadState` (`apps/api/prisma/models/direct-messages.prisma`, confirmed the file's real name
  via `ls apps/api/prisma/models/ | grep direct`) is the per-`(userId, conversationId)` model this
  repo already uses for a DM-scoped, per-user row: `@@unique([userId, conversationId])`,
  `@@index([conversationId, lastReadAt])` — the schema shape to mirror for the new mute model, not
  `NotificationPreference`'s server/channel scope columns.
- `DirectConversation` (shared contract, `packages/shared/src/api-contract.ts:549-558`): `members`,
  `messages` (latest one), `unreadCount?: number` — flattened onto the conversation object, not
  nested; the mute fields join this same flat shape.
- `requireConversationMembership` (`apps/api/src/modules/direct-messages/direct-message.format.ts:170-180`):
  the existing "member or 404, no existence leak" guard every conversation-scoped call already uses
  (`requireConversationMember` wrapper, `direct-messages.service.ts:222-224`).
- Realtime: `RealtimeEvents.DmConversationUpdated` (`'dm:conversation-updated'`,
  `packages/shared/src/realtime-events.ts:20`) is already wired on the web
  (`apps/web/src/hooks/useRealtimeSocket.ts:215-217`: `nextSocket.on(RealtimeEvents.DmConversationUpdated, () => void loadDirectConversations(auth.accessToken))`)
  but is **never emitted anywhere in `apps/api/src`** (`grep -rn "DmConversationUpdated" apps/api/src`
  returns no match) — a dead server-side event, already shaped exactly as an id-only "go refetch the
  conversation list" signal.
- Web state for DMs is **not** React Query: `useDirectMessages.ts` holds `directConversations` in a
  plain `useState` and refetches via `loadDirectConversations()` after every mutation
  (`apps/web/src/hooks/useDirectMessages.ts:64-84`); `useGroupConversations.ts`'s `runGroupAction`
  helper (`:24-42`) is the existing "PATCH then refetch the list" pattern for a conversation-scoped
  write (`renameGroupConversation`, `:60-70`), scoped to group-only actions in that file.
- Mentions: `DirectMessagesService` has no mention parsing at all
  (`docs/features/everyone-here-and-role-mentions.md:38`: "`DirectMessagesService` has no mention
  parsing at all today (grepped `direct-messages.service.ts` for `Mention`/`parseMentions` — no
  match) and DMs have no server/role concept to resolve `@everyone`/`@here`/role against"). Every DM
  message, mention-shaped text or not, goes through the same single `notifications.create` +
  `sendDirectMessagePush` path — there is no separate "mention push" to except from mute.
- Blocking (`docs/features/user-blocking.md`): a block prevents a 1-1 DM from being created or sent
  at all (`POST /friends/:userId/dm` and `POST /direct-conversations/:id/messages` both `403` while a
  block exists in either direction; group DMs are unaffected by blocks per that doc's Rules). A
  blocked 1-1 conversation therefore never reaches the point where a mute row would matter — the two
  mechanisms do not overlap and neither needs to check the other.
- Account status / "do not disturb": `User.status` (`apps/api/prisma/models/users.prisma:46`, enum
  `UserStatus`) is settable to `DND` via `PATCH /users/me`
  (`apps/api/src/modules/users/dto/update-me.dto.ts:57-58`, `@IsEnum(UserStatus)`). Both
  `PushService.shouldSendPush` (`push.service.ts:217-222`) and `shouldSendDirectMessagePush`
  (`:249-254`) check only `status === 'ONLINE'` to skip a push — `DND` is treated exactly like `IDLE`
  or `OFFLINE`: **push is still sent** to a user who set themselves to `DND`. Grepped
  `apps/api/src` for `DND`/`doNotDisturb` — no branch anywhere reads the value for suppression. The
  web's `ProfileSettings.tsx:16-20` only offers `DND` as a status label; it does not gate
  notifications. This is an existing gap, not something this doc's mute is meant to paper over — a
  user who wants DND to actually suppress push must use the existing global mute today.
- Latest migration folder: `apps/api/prisma/migrations/20260925001000_add_decision_channels`.
  `docs/features/platform-audit-log.md` (drafted in this same batch) reserves the next slot,
  `20260925002000`; another doc in this batch, `role-hoist-and-icon.md`, is also expected to claim a
  slot around there. This doc uses **`20260925004000`**, two slots past the reserved one, to leave
  headroom and avoid a collision with whichever of `002000`/`003000` role-hoist-and-icon picks.

## Changes

### Semantics (read this first — the main failure mode of this feature)

A muted conversation behaves like Discord's own DM mute: **no notification, but still unread.**
Concretely, muting a conversation:

- **Suppresses**: the web push for a message sent in that conversation
  (`PushService.sendDirectMessagePush`'s gate).
- **Does not suppress**: the in-app `Notification` row (`direct-messages.service.ts:173-184`,
  untouched), the unread count and `dm:unread` badge (`emitDirectUnread`, `:273-288`, untouched), or
  the conversation's position in `GET /direct-conversations` (still ordered by `updatedAt desc`,
  still bumped on every new message, `direct-messages.service.ts:141-144`, untouched).

Why: this matches (a) the product's own reference point (Discord), (b) this repo's explicit,
previously-decided precedent that mute stays push-only for v1 (`timed-notification-mute.md`,
`open-questions.md` #42 — "suppressing badges touches unread tracking across several modules and is
a follow-up"), and (c) it is the smallest change: it adds exactly one new gate to one existing
function (`shouldSendDirectMessagePush`) and touches no unread-counting code at all. Suppressing the
unread badge too would require a second decision (does a muted-and-unread conversation still bump to
the top of the list? does it still show a numeric badge, just no push?) that nothing today has
answered, and would touch `countDirectUnread`, `emitDirectUnread`, and the client's badge rendering
— a materially larger change for a value not asked for here.

### Rules / Flow

1. New model `DirectConversationMute`, one row per `(userId, conversationId)`, added to
   `apps/api/prisma/models/direct-messages.prisma` next to `DirectReadState` (same per-user,
   per-conversation shape — `@@unique([userId, conversationId])`):

   ```prisma
   model DirectConversationMute {
     id             String             @id @default(cuid())
     userId         String
     conversationId String
     muted          Boolean            @default(false)
     // Same semantics as NotificationPreference.mutedUntil: null + muted = forever, a past value = expired.
     mutedUntil     DateTime?
     createdAt      DateTime           @default(now())
     updatedAt      DateTime           @updatedAt
     user           User               @relation(fields: [userId], references: [id], onDelete: Cascade)
     conversation   DirectConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

     @@unique([userId, conversationId])
     @@index([conversationId])
   }
   ```

2. `UsersService`'s existing `NotificationPreference` PATCH is **not** touched or reused directly —
   see Trade-offs for why a dedicated model beats adding a third `conversationId` scope column there.
   The **shape and the two helper functions** (`isMuteActive`, `resolveMutedUntil`,
   `notification-mute.ts:36-48`) are reused unmodified; only the storage row is new.
3. New endpoint `PATCH /direct-conversations/:conversationId/mute` on the existing
   `DirectMessagesController` (`direct-messages.controller.ts`), calling a new
   `DirectMessagesService.muteConversation(userId, conversationId, dto)`:
   - `requireConversationMember` (existing guard, `direct-messages.service.ts:222-224`) — non-member
     gets `404`, same as every other conversation-scoped call.
   - `dto.muted === false` → upserts `{ muted: false, mutedUntil: null }` (unmute always clears the
     expiry, mirroring `timed-notification-mute.md` Rules item 3). `dto.muteDuration` sent alongside
     `muted: false` is `400` (same rule as the existing endpoint).
   - `dto.muted === true` → `mutedUntil = resolveMutedUntil(dto.muteDuration ?? 'forever', now)`
     (omitted duration defaults to `forever`, same as the existing endpoint's edge case).
   - Upserts on `(userId, conversationId)` — idempotent: re-muting with a new duration simply
     overwrites `mutedUntil` from `now`, no merge with remaining time (same rule as the existing
     mute).
   - Emits `RealtimeEvents.DmConversationUpdated` to `this.realtime.userRoom(userId)` only (not the
     conversation room — mute is the caller's own preference, no other member's client needs to
     react to it). The web's existing listener (`useRealtimeSocket.ts:215-217`) already calls
     `loadDirectConversations()` on this event with no payload read, so no new event or payload shape
     is needed — this reuses a previously-unused event exactly as it was already shaped.
   - Returns `{ conversationId, muted, mutedUntil }`.
4. `PushService.shouldSendDirectMessagePush(userId, conversationId)` gains the `conversationId`
   parameter and, after the existing global-preference check, loads the
   `DirectConversationMute` row for `(userId, conversationId)` and returns `false` if
   `isMuteActive(conversationMute, now)` is true — in addition to (not instead of) the existing
   global-mute check. **This is the one place the check runs**: `sendDirectMessagePush` is the DM
   send path's single call site (Current behavior), so no duplicate check is added to
   `notifications.create` or anywhere else.
5. `DirectMessagesService.listConversations` (`:37-55`) batch-loads mute rows the same way it already
   batches unread counts: one `prisma.directConversationMute.findMany({ where: { userId,
   conversationId: { in: ids } } })`, folded into a `Record<conversationId, { muted, mutedUntil }>`
   and merged onto each conversation alongside `unreadCount` — no N+1, one extra query for the whole
   list, mirroring `countDirectUnread`'s shape (not its raw-SQL join, since this is a direct lookup by
   id list, not a per-row aggregate).
6. Shared contract: `DirectConversation` (`packages/shared/src/api-contract.ts:549-558`) gains
   `muted?: boolean; mutedUntil?: string | null` as two more flat, optional fields — same style as
   the existing `unreadCount?: number` on the same interface, not a nested object (consistent with
   how the rest of that interface is shaped).
7. Group vs 1-1: **identical mechanism.** `DirectConversationMute` is keyed on `conversationId` alone,
   which already covers both `isGroup: true` and `isGroup: false` rows in `DirectConversation` — no
   branch needed anywhere in the mute code for group vs. 1-1.
8. Web: a bell/bell-off `IconButton` in the DM header's `headerActions`
   (`apps/web/src/components/home/HomeDirectMessageView.tsx:169-210`, placed before
   `GroupConversationMenu`/`DirectPinnedMessages`), opening a `DropdownMenuRoot`/`DropdownMenuContent`
   with the five duration items (`muteDurations`, reusing `MUTE_DURATION_LABEL_KEYS` from
   `apps/web/src/utils/notificationMute.ts:4-9`) plus an "Unmute" item when
   `isMuteActive({ muted: activeConversation.muted, mutedUntil: activeConversation.mutedUntil })` is
   true (client port, same function, same file). `NotificationMuteMenu`
   (`apps/web/src/components/workspace/NotificationMuteMenu.tsx`) is **not** reused as-is: it is built
   on `ContextMenu*` primitives (Radix `ContextMenu`, right-click triggered,
   `apps/web/src/components/ui/ContextMenu.tsx:6-7`), while a header icon button needs a left-click
   `DropdownMenu*` (a different Radix root, `apps/web/src/components/ui/index.ts:32-37` — no `Sub`
   exported there today). The five duration items are flat here (no nested submenu needed inside an
   already-dedicated menu), so this is a small new component, not a fork of the existing one — see
   Trade-offs.
9. Web: `ConversationList.tsx` (`apps/web/src/components/home/ConversationList.tsx`) dims a muted
   row's title the same cosmetic way the muted server icon/channel row already do
   (`color: var(--text-disabled)`, `timed-notification-mute.md`'s Deviations) — using the `muted`/
   `mutedUntil` fields now present on each `DirectConversation`, no extra request. No new context menu
   on the list row in this change (see Trade-offs) — the header control is the single place to mute.

### Edge cases

| Case | Expected behavior |
|---|---|
| `muteDuration` omitted, `muted: true` | Treated as `forever` (`mutedUntil = null`), same as the existing endpoint's edge case. |
| `muteDuration` sent with `muted: false` | `400` — same rule as the existing endpoint. |
| PATCH after expiry (row exists, `mutedUntil` in the past) | Read as not-muted (`isMuteActive` false); the next mute PATCH overwrites `mutedUntil` with a fresh value. |
| PATCH by a non-member (or a past/former group member) | `404` (`requireConversationMember`), no row created, existence not leaked — same as every other conversation-scoped endpoint. |
| Duplicate mute PATCH (already muted, same or different duration) | Idempotent: `mutedUntil` recomputed from `now`, not merged with remaining time. |
| Conversation muted, global mute also active | No push either way — both gates are independent `OR`s in `shouldSendDirectMessagePush`. |
| Conversation muted, global mute inactive | No push for that conversation only; other conversations are unaffected. |
| Global mute active, this one conversation explicitly unmuted | Still no push — the global gate is unconditional, matching how a channel-level unmute cannot defeat a server mute in `timed-notification-mute.md`. Muting is additive, never an override. |
| Group DM, one member mutes it | Only that member's push is suppressed; `DirectConversationMute` is per-`(userId, conversationId)`, so other members' push/preferences are untouched. |
| Recipient is `ONLINE` | No push regardless of mute state — unchanged, existing rule. |
| A message with no mention concept (see Current behavior) | No special-casing: every DM message goes through the same suppressed-or-not push path. |
| Blocked 1-1 conversation | Not reachable: message send already `403`s before any push logic runs (`user-blocking.md`); mute is never consulted. |
| Unauthenticated request | `401`, unchanged — the controller's existing `JwtAuthGuard`. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/prisma/models/direct-messages.prisma` | Add `DirectConversationMute` model. |
| `apps/api/prisma/migrations/20260925004000_add_direct_conversation_mute/` | New hand-written migration. |
| `apps/api/src/modules/direct-messages/dto/update-direct-conversation-mute.dto.ts` (new) | `{ muted: boolean; muteDuration?: MuteDuration }`, `class-validator`. |
| `apps/api/src/modules/direct-messages/direct-messages.controller.ts` | Add `PATCH :conversationId/mute`. |
| `apps/api/src/modules/direct-messages/direct-messages.service.ts` | Add `muteConversation`; batch-load mute rows in `listConversations`. |
| `apps/api/src/modules/direct-messages/direct-message.format.ts` | Merge `muted`/`mutedUntil` onto each conversation the same way `unreadCount` is merged today (or a small sibling helper next to `directConversationInclude`). |
| `apps/api/src/modules/push/push.service.ts` | `shouldSendDirectMessagePush` gains `conversationId` and the `DirectConversationMute` check. |
| `packages/shared/src/api-contract.ts` | `DirectConversation` gains `muted?: boolean; mutedUntil?: string | null`. |
| `apps/web/src/api.ts` | `muteDirectConversation(conversationId, input)` request helper. |
| `apps/web/src/hooks/useDirectMessages.ts` | `muteConversation`/`unmuteConversation`, calling the endpoint then `loadDirectConversations()` — same pattern as `useGroupConversations.ts`'s `runGroupAction`, generalized here since mute applies to every conversation, not only groups. |
| `apps/web/src/hooks/useRealtimeSocket.ts` | No change — `DmConversationUpdated` is already wired (Current behavior); confirmed, not re-verified by running it. |
| `apps/web/src/components/home/DirectConversationMuteMenu.tsx` (new) | The `DropdownMenu`-based duration menu described in Changes item 8. |
| `apps/web/src/components/home/HomeDirectMessageView.tsx` | New header `IconButton` + `DirectConversationMuteMenu`. |
| `apps/web/src/components/home/ConversationList.tsx` | Dim a muted row's title. |
| `apps/web/src/i18n/locales/{en,vi}/home.ts` | New keys `dm.header.mute`, `dm.header.unmute` (tooltip labels); the five duration labels and "Unmute"/"Muted until …" strings are already generic (`mute.*` in `common.ts:118-126`) and are reused as-is. |

**API contract**

- `PATCH /direct-conversations/:conversationId/mute`
  - Request: `{ muted: boolean; muteDuration?: '15m' | '1h' | '8h' | '24h' | 'forever' }`
  - Response `200`: `{ conversationId: string; muted: boolean; mutedUntil: string | null }`
  - Errors: `400` `muteDuration` sent without `muted: true` · `404` caller is not a conversation
    member (existence not leaked) · `401` unauthenticated
- `GET /direct-conversations` — response items gain `muted: boolean; mutedUntil: string | null`. No
  other change to this endpoint's shape or behavior.

**DB / migration**

- New table `DirectConversationMute`: `id`, `userId`, `conversationId`, `muted BOOLEAN DEFAULT
  false`, `mutedUntil TIMESTAMP(3) NULL`, `createdAt`, `updatedAt`; FKs to `User` (`onDelete:
  Cascade`) and `DirectConversation` (`onDelete: Cascade` — a deleted conversation's mute rows are
  cleaned up automatically, same as `DirectReadState`); `@@unique([userId, conversationId])` for the
  upsert key, `@@index([conversationId])` for the batched list lookup (`conversationId IN (...)`).
- Migration file: `apps/api/prisma/migrations/20260925004000_add_direct_conversation_mute/migration.sql`,
  hand-written `CREATE TABLE`, with the `down()` (`DROP TABLE`) written as a comment in the same file
  — same convention `timed-notification-mute.md`'s migration follows (no separate down-migration
  file in this repo). Creating a new empty table has no lock or backfill concern.
- No change to `NotificationPreference` or its migration.

**Libraries** — none new; reuses `class-validator` (`@IsBoolean`, `@IsIn`), the existing
`DropdownMenu*` primitives, and `muteDurations`/`MuteDuration` already exported from
`@discord-clone/shared`.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): a dedicated `DirectConversationMute` model, keyed `(userId, conversationId)`** | Mirrors the repo's own precedent for a DM-scoped per-user row (`DirectReadState`); the DM mute PATCH endpoint stays simple (one boolean + one duration, no server/channel branching); reuses the *shape and helpers* (`isMuteActive`, `resolveMutedUntil`) exactly as instructed, without repurposing an unrelated table. | A second small table with the same two columns (`muted`, `mutedUntil`) as `NotificationPreference` — some structural duplication. | Chosen — the duplication is two columns and one index; the alternative couples an unrelated authorization model and two dead fields into every DM mute read. |
| B: add `conversationId String?` to `NotificationPreference` and reuse its PATCH endpoint | One table for every mute scope; `GET /users/me/notification-preferences` already lists every scope. | `NotificationPreference` rows also carry `mentionOnly` and `desktopEnabled`, neither meaningful for a DM (DMs have no per-conversation desktop toggle or mention-only mode in this repo) — a DM row would carry two always-`false`, never-read fields, silently confusing. The existing PATCH endpoint's authorization is server-membership / channel-`ViewChannel` (`timed-notification-mute.md` Rules item 5); a DM needs conversation-membership instead, so the same endpoint would grow a third, differently-authorized branch. The endpoint's scope-resolution logic (`serverId ?? channelId ?? conversationId`, `shouldSendPush`'s per-level `OR`) would grow a fourth axis for a feature that only ever needs one. | Rejected — couples a working, already-complex endpoint (partial-merge semantics, three-way scope auth) to a shape it was not built for, to save one small table. |
| C: no persistent row — encode mute state as a client-only "hidden until" local preference | No migration, no API change. | Does not survive a second device or a reinstall; does not actually suppress the server-side push, which is the whole point (a client-only mute cannot stop `PushService` from sending). | Rejected — fails the acceptance criterion that push is actually suppressed server-side. |
| D: suppress the in-app `Notification` row and unread badge too, not just push | Closer to some users' expectation of "fully silence this conversation." | Not asked for here, and this repo already decided (twice: `open-questions.md` #42, and this doc's own Semantics section) that mute stays push-only for v1; doing it now would touch `countDirectUnread`, `emitDirectUnread`, and badge rendering — a materially larger, undecided change smuggled into a smaller doc. | Rejected — out of scope, named explicitly so it does not read as an oversight. |
| **E (chosen): reuse the dead `DmConversationUpdated` event for the realtime signal** | Already wired end-to-end on the web (`useRealtimeSocket.ts:215-217`) and already does exactly "refetch the conversation list" with no payload; zero new event, zero new client code. | The event's name suggests something changed about the conversation record itself (rename, membership) — using it for a purely personal mute preference is a slight semantic stretch (any member's rename also triggers every other member's client to refetch, whereas a mute is per-user; the same event now serves both, so a later reader might assume it always means "a shared field changed"). | Chosen — the alternative (a new `dm:mute-updated` event) duplicates an already-correct client listener for zero behavioral gain; the semantic stretch is called out here so a future reader is not confused, and the event is only emitted to the caller's own `userRoom`, never the conversation room. |
| F: a new small header-only mute button with no duration choice (mute forever / unmute only) | Simpler component, no new `DropdownMenu` usage. | Loses parity with the server/channel mute UX (`15m/1h/8h/24h/forever`), which is the acceptance criterion ("match the existing server/channel mute's options exactly"). | Rejected — the task explicitly requires matching the existing duration set. |

What the chosen option costs: one new table and index, one new endpoint, one extra batched query per
`GET /direct-conversations` call (a single `findMany` keyed by `conversationId IN (...)`, same
performance shape as the existing unread-count query), and one new small web component
(`DirectConversationMuteMenu`) that duplicates ~20 lines of menu-item rendering from
`NotificationMuteMenu` rather than sharing it, because the two sit on different Radix menu
primitives (see Changes item 8) — acceptable per the repo's own rule-of-three (this is now the third
distinct mute-menu call site: server rail, channel list, and DM header), but flagged here since a
future fourth call site should trigger actually unifying the two into one primitive-agnostic
component instead of a fourth copy.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- **`DirectConversation` gains `muted`/`mutedUntil` via a new file, not `api-contract.ts` directly.**
  Item 6 of Changes said `packages/shared/src/api-contract.ts`'s `DirectConversation` interface would
  gain the two fields inline. The implementing agent's brief reserved `api-contract.ts` and `bots.ts`
  for a different, concurrently-running agent editing that same file, to avoid a merge conflict in a
  shared working tree. Instead, `packages/shared/src/direct-conversation-mute.ts` (new file, exported
  from `packages/shared/src/index.ts` the same way `platform-audit.ts`/`stickers-soundboard.ts`
  already are) declares `UpdateDirectConversationMuteInput`, `DirectConversationMuteResult`, and
  `DirectConversationWithMute = DirectConversation & { muted?: boolean; mutedUntil?: string | null }`.
  Web code that reads the two new fields (`ConversationList.tsx`, `HomeDirectMessageView.tsx`,
  `useDirectMessages.ts`, `components/home/types.ts`) is typed with `DirectConversationWithMute`
  instead; everywhere else, the plain `DirectConversation` type is still assignable to it (the two
  extra fields are optional), so no other file needed a type change. Cost: one extra exported type
  file and an intersection type instead of one interface, for a change that would otherwise have been
  a two-line diff in `api-contract.ts` — acceptable to avoid a concurrent-edit conflict; a later
  cleanup can fold the two fields into `DirectConversation` directly once nothing else is mid-edit on
  that file.
- **`muteDirectConversation` request helper.** Added to `apps/web/src/api.ts` as the doc's Technical
  approach table specified, even though most DM/group actions in this codebase call `apiRequest`
  inline inside the hook rather than through a named wrapper (`useGroupConversations.ts`). Kept as the
  doc said, for the one call site in `useDirectMessages.ts`.
- **Rate limit on the new endpoint.** `PATCH :conversationId/mute` carries a
  `@RateLimit({ keyPrefix: 'direct-conversation-mute', limit: 30, windowMs: 60_000 })` decorator, not
  mentioned in the doc's Technical approach table. Added for consistency: every other mutating
  endpoint on `DirectMessagesController` already carries one.
- **`HomePanelActions`/`HomePanelState` (`components/home/types.ts`) wiring.** Not listed in Files
  touched; needed regardless, since `HomeDirectMessageView`'s new mute control reads
  `activeConversation.muted`/`mutedUntil` and calls the new actions, and `useHomeWorkspace.ts` is the
  composition point that turns `useDirectMessages.ts`'s return value into `HomePanelProps`.

## Risks & rollback

- **What can break**: `shouldSendDirectMessagePush`'s signature changes (`userId` → `userId,
  conversationId`); its one caller, `sendDirectMessagePush` (`push.service.ts:127`), already has
  `conversationId` in scope (`SendDirectMessagePushInput.conversationId`), so this is a same-file,
  same-commit change with no other caller to update (confirmed: `grep -rn
  shouldSendDirectMessagePush apps/api/src` has exactly one call site today).
- **What can break**: reusing `DmConversationUpdated` for a personal mute means every device of the
  *muting* user refetches the full conversation list on mute/unmute — a full-list refetch for a
  single-field change, same cost `renameGroupConversation` already accepts today for a rename.
- **Not covered**: DND-based suppression, in-app/unread suppression, DM mention bypass (no mention
  concept exists to bypess) — all named explicitly in Scope.
- **Rollback**: revert the code; the migration is purely additive (`down()` drops the new table only,
  written as a comment per this repo's convention) and safe to roll back independently — no other
  table's column depends on `DirectConversationMute`. Rows written before rollback are simply lost,
  which only means the affected users' DM mutes silently stop applying (fail open to "not muted"),
  not a data-loss risk for anything else.

## Test plan

Not covered by automated tests (repo policy, `RULE.md`: no `*.test.ts`/`*.spec.ts` files).

**Manual**

1. Mute one 1-1 conversation for `15m` while offline; have the other member send a message → no
   push arrives for that conversation. Send a message in a *different*, unmuted conversation from the
   same recipient's other friend → push arrives normally.
2. `GET /direct-conversations` right after step 1 → the muted conversation's `unreadCount` still
   increments and the conversation still reorders to the top on the new message (muted-but-still-
   unread check) — confirming Semantics is implemented as designed, not as a full silence.
3. Wait past the 15-minute expiry, send another message to the same conversation while still offline
   → push now arrives (read-time expiry, no sweep needed).
4. Mute a conversation `forever` → messages keep arriving with no push indefinitely until manually
   unmuted; `GET /direct-conversations` shows `muted: true, mutedUntil: null` throughout.
5. Mute the conversation, then also mute DMs globally via the existing `ProfileSettings.tsx` switch,
   then unmute only the conversation → still no push (global gate is unconditional, edge case table).
6. `PATCH .../mute` from a user who is not a member of that conversation → `404`, no row created
   (verify via a direct DB check or a repeat `GET` from an authorized member showing no stray row).
7. `PATCH .../mute` with `muteDuration: '1h'` and `muted: false` → `400`.
8. Group DM with 3 members: one member mutes it → only that member's push is suppressed; the other
   two still receive push normally on the next message.
9. Web: open the DM header mute control, pick `1h`, confirm the icon/tooltip flips to "Unmute" and
   the conversation row dims in the list; reload the page → state persists (read from `GET
   /direct-conversations`, not local-only).
10. Open the same account on a second browser/tab, mute from tab A → tab B's conversation list
    reflects the mute after the `dm:conversation-updated` refetch, with no manual reload.

## Deployment notes

- New env vars: none.
- Migration `20260925004000_add_direct_conversation_mute` must run before deploying the API (new
  table, no existing-row impact, safe to run online).
- Shared package (`packages/shared`) must be rebuilt before the API/web build (adds
  `DirectConversation.muted`/`mutedUntil`), per the repo's monorepo build order.
- No cache/queue to clear.
- This repo keeps flat `docs/features/<kebab>.md` files with no per-menu `overview.md` (confirmed by
  `ls docs/features/` — none exists; `dm-push-notifications.md` and `timed-notification-mute.md`
  follow the same flat convention) — no overview file to update.
- Breaking API change: none. `PATCH /direct-conversations/:conversationId/mute` is a new endpoint;
  `GET /direct-conversations`'s two new fields are additive and optional in the shared type, so an
  older client ignoring them keeps working.
- Add the two new i18n keys to both `en.ts`/`vi.ts` locale files under `home.ts` and run `npm run
  i18n:check` before merging the web change.
