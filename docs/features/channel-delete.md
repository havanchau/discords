# Channel Delete

- **Status**: implemented (`channels.service.ts:220`, wired at `channels.controller.ts:55`, web
  `useWorkspaceNavigation.ts:304`); verified 2026-10-01. 10 assertions across scenarios 1, 4, 6, 7, 8
  and the API half of 9 all pass. **Not run:** scenario 2 (the open-channel redirect), scenario 3
  (deleting a VOICE/STAGE channel with a live call), scenario 5 (an ANNOUNCEMENT channel's follower
  list) and the web half of scenario 9 — all four need a browser or a live call.
- **Date**: 2026-09-29
- **Related**: [`channel-categories.md`](channel-categories.md), [`channel-live-settings-sync.md`](channel-live-settings-sync.md), [`announcement-channels.md`](announcement-channels.md), [`decision-channels.md`](decision-channels.md), `../feature-roadmap.md:463`

## Goal

There is no way to delete a channel today. `ChannelsController` (`apps/api/src/modules/channels/channels.controller.ts:1-56`) exposes `POST servers/:serverId/channels`, `GET servers/:serverId/channels`, `GET channels/:channelId`, `PATCH channels/:channelId`, and `GET`/`PATCH channels/:channelId/overrides` — no `DELETE`. `grep -rn "deleteChannel\|channel:deleted" apps/api/src apps/web/src packages` returns zero matches. A server can be deleted (`ServerOwnershipService.deleteServer`, `apps/api/src/modules/servers/server-ownership.service.ts:83-159`, wired to `DELETE servers/:serverId` at `apps/api/src/modules/servers/servers.controller.ts:74-79`) and a category can be deleted (`CategoriesService.deleteCategory`, `apps/api/src/modules/channels/categories.service.ts:50-64`, wired to `DELETE categories/:categoryId` at `apps/api/src/modules/channels/categories.controller.ts:34-37`), but a channel cannot. `docs/feature-roadmap.md:463` records the exact consequence: the `announcement-channels.md` manual test plan's step 12 ("delete the source announcement channel") is "not runnable as written… the repo has no channel-delete endpoint."

**Acceptance criteria**:

- [ ] A member holding `ManageChannels` on the channel's server can permanently delete any channel (any `ChannelType`) via a new `DELETE /channels/:channelId` endpoint.
- [ ] Deleting a channel removes every row that references it through a schema cascade (messages, threads, pins, overrides, read state, forum tags, decisions, stage rows, follow rows) in one transaction-safe database operation, with no orphaned rows left behind that the schema already models as cascading.
- [ ] Every member with the channel open, or with it visible in their sidebar, sees it disappear without reloading or reopening another channel first — the same live-refresh mechanism `channel-live-settings-sync.md` built for settings changes.
- [ ] A member connected to the channel's live voice/stage call is disconnected from that call, the same way `ServerOwnershipService.deleteServer` already disconnects every call when a whole server is deleted.
- [ ] A member without `ManageChannels` gets `403`; a channel id that does not exist (or already deleted) gets `404`.

## Scope

**In scope**

- `DELETE /channels/:channelId`, gated by `Permission.ManageChannels` on the channel's server — the same permission `PATCH channels/:channelId` and `DELETE categories/:categoryId` already require.
- A hard delete of the `Channel` row, relying on the schema's existing `onDelete: Cascade`/`SetNull` rules (see Current behavior) to clean up everything that already cascades from a channel today.
- Ending any live call (voice or stage) in the channel before the row is removed, reusing `CallRegistryService.endCalls` exactly as `ServerOwnershipService.deleteServer` does.
- An audit log entry on the channel's server, following the `writeAuditLog` convention both sibling services already use.
- A new `channel:deleted` realtime event and the web listener that reacts to it, following the `channel:updated` pattern `channel-live-settings-sync.md` built.
- Deleting the channel's stored avatar file if no other row still references the same URL, following the same `deleteUploadIfUnreferenced` pattern `ServerOwnershipService.deleteServer` uses for a server's avatar.
- A delete action in the web channel settings UI (`ChannelSettings.tsx`), following the confirm-then-delete UI shape `EditCategoryDialog.tsx` already has for categories.
- New i18n keys in both `en` and `vi` catalogs, following the existing `category.action.delete` / `category.action.confirmDelete` naming.

**Out of scope**

- Soft-delete / trash / restore for a channel (see Trade-offs — a hard delete is chosen, matching the category and server precedents).
- Blocking deletion of the last channel, or the last `TEXT` channel, of a server. The "at least one `TEXT` channel" rule that exists today only runs once, at server bootstrap (`apps/api/src/modules/servers/server-bootstrap.ts:29,103-116`); no other code path enforces it afterward (grepped `server-bootstrap.ts`, `servers.service.ts`, `categories.service.ts` — no runtime check). Adding such a guard is a separate product decision, recorded as an open question below.
- Propagating deletion to a channel referenced only by a plain, non-foreign-key id (`SavedMessage.channelId`, `AutoModRule.exemptChannelIds`, `Interaction.channelId`) — these already tolerate a dangling id by design (see Current behavior), and this doc does not change that.
- A grace period / "channel deleted, undo within N seconds" UX. Not requested, and the server delete precedent has none either.
- Bulk delete (multiple channels in one call).
- Changing `ChannelsService.evictUnconfirmedMembers`, `requireReadableChannel`, or any other authorization check — this doc only adds a new destructive action gated by the permission that already governs every other channel-management action.

## Current behavior

- `ChannelsController` (`apps/api/src/modules/channels/channels.controller.ts:1-56`) has no `@Delete` route. `ChannelsService` (`apps/api/src/modules/channels/channels.service.ts:1-245`) has no `deleteChannel` method.
- **Category delete is the closest working precedent** (`CategoriesService.deleteCategory`, `categories.service.ts:50-64`): it requires `ManageChannels` on the server (`:52-56`), issues a single `prisma.channelCategory.delete` (`:58`, comment: _"The foreign key sets channels.categoryId to NULL, so channels become uncategorized"_ — relies on `Channel.categoryId`'s `onDelete: SetNull`, `apps/api/prisma/models/channels.prisma:41`), writes an audit log (`:59-61`), and returns `{ ok: true }`. It emits **no realtime event** — a category's presence is read from `server.categories`, refreshed only on the next full `serverDetail` fetch (inferred from there being no `RealtimePublisher` import in `categories.service.ts`/`categories.module.ts` — not independently traced through every web consumer this session).
- **Server delete** (`ServerOwnershipService.deleteServer`, `server-ownership.service.ts:83-159`) is the closest precedent for cleaning up *everything a deletion touches*, not just the DB row: it requires the owner plus a 2FA/password reauthentication (`:84-87`), reads every server-owned file and member/channel id **before** the cascade removes them (`:92-110`, comment: _"Read before the cascade removes them: who to tell, which rooms and calls to close, and which stored files the server alone owns"_), issues a conditional `prisma.server.deleteMany({ where: { id: serverId, ownerId: userId } })` (`:113-116`, guarding against a concurrent ownership transfer), emits `RealtimeEvents.ServerDeleted` to the server room and every member's user room (`:127-134`), calls `removeUsersFromRooms` to evict every member's socket from the server room and every one of the server's channel rooms (`:135`), syncs bot gateway state for any bot member (`:136-142`), ends every call in every one of the server's channels via `this.endCalls(channelIds)` → `CallRegistryService.endCalls` (`:143`, `:167-168`), and finally deletes now-orphaned sticker/soundboard files and any avatar URL not referenced by another row (`:144-158`).
- `RealtimePublisher.removeUsersFromRooms(userIds, rooms)` (`apps/api/src/modules/realtime/realtime-publisher.service.ts:41-44`) is a safe no-op for a user not actually in the room — it moves every connected socket of each listed user out of the listed rooms via `socketsLeave`.
- `CallRegistryService.endCalls(callIds)` (`apps/api/src/modules/realtime/call-registry.service.ts:139-151`, doc comment: _"Ends every call among `callIds` for everyone in it (server delete), as `removeUser` does"_) removes every participant of each call id (a call id is a channel id for a voice/stage channel, `realtime-publisher.service.ts:92`) from Redis's participant set, emits `voice:user-left` to each, and moves their sockets out of the call room — this already generalizes to a single channel id, not just a whole server's worth.
- `ChannelsModule` (`apps/api/src/modules/channels/channels.module.ts`) currently imports `AuthModule`, `ServersModule`, `PermissionsModule`, `RealtimePublisherModule` — **not** `CallRegistryModule`, `LivekitModule`, or `UploadsModule`. `ServersModule` (`apps/api/src/modules/servers/servers.module.ts:19-27`) already imports all three for `ServerOwnershipService`'s equivalent cleanup.
- **What already cascades from `Channel` today** (grepped every `channelId`/`sourceChannelId`/`alertChannelId` relation across `apps/api/prisma/models/*.prisma`):

  | Referencing model | FK behavior | Effect of deleting the channel |
  |---|---|---|
  | `Message.channelId` (`messages.prisma:69`) | `Cascade` | Every message in the channel is deleted, including its reactions, attachments, pins, revisions, and poll (each of those cascades again from `Message`). |
  | `Thread.channelId` (`messages.prisma:111`) | `Cascade` | Every thread (including forum posts and decision proposals) in the channel is deleted, cascading again to `ThreadParticipant`/`ThreadTag`/its `Decision` row. |
  | `ForumTag.channelId` (`messages.prisma:131`) | `Cascade` | A `FORUM` channel's tag set is deleted. |
  | `MessagePin.channelId` (`messages.prisma:198`) | `Cascade` | Redundant with `Message`'s own cascade (a pin's `messageId` also cascades) — listed for completeness. |
  | `ScheduledMessage.channelId` (`messages.prisma:259`) | `Cascade` | **A pending scheduled send targeting this channel is deleted outright**, silently, with no notification to its author — see Edge cases. |
  | `Decision.channelId` (`decisions.prisma:28`) | `Cascade` | Every decision proposal (`PROPOSED`, `ACCEPTED`, or `REJECTED`) tied to this `DECISION` channel is deleted, cascading again to its `Thread`. |
  | `ServerWebhook.channelId` (`webhooks.prisma:22`) | `Cascade` | Every ordinary incoming webhook posting into this channel is deleted, including its synthetic `User` row only if that row itself cascades — not independently re-verified this session; `ServerWebhook` itself is gone either way, so the webhook can no longer be invoked. |
  | `ServerWebhook.sourceChannelId` (`webhooks.prisma:23`) | `Cascade` | Every **follow** row where this channel is the `ANNOUNCEMENT` source (`announcement-channels.md`) is deleted — every other server following this channel stops receiving crossposts, silently. |
  | `ChannelPermissionOverride.channelId` (`channels.prisma:73`) | `Cascade` | Deleted with the channel — nothing left to override. |
  | `ReadState.channelId` (`channels.prisma:89`) | `Cascade` | Deleted — no dangling per-member "last read" marker. |
  | `NotificationPreference.channelId` (`notifications.prisma:15`, nullable) | `Cascade` | A per-channel mute/notification preference for this channel is deleted. |
  | `PushNotificationThrottle.channelId` (`notifications.prisma:41`) | `Cascade` | Deleted. |
  | `StageSpeaker.channelId` / `StageSpeakRequest.channelId` (`channels.prisma:97-118`) | `Cascade` | A `STAGE` channel's speaker roster and pending speak requests are deleted; `stage.service.ts` already deletes these rows explicitly on member removal (`stage-member-cleanup.ts:23-24`) but never needs to for a channel delete — the FK does it. |
  | `Notification.channelId` (`notifications.prisma:54`, nullable) | none (plain id — `Notification` has no `channel` relation field at all, `notifications.prisma:47-66`) | An existing notification that names this channel keeps existing with a channel id that no longer resolves; same tolerance-for-a-dangling-plain-id pattern as `SavedMessage`/`Interaction`. |
  | `AutoModRule.alertChannelId` (`moderation.prisma:83`, nullable) | `SetNull` | An AutoMod rule that posts its alerts into this channel keeps running; its `alertChannelId` becomes `null`, silently disabling only the alert delivery. |
  | `ServerEvent.channelId` (`servers.prisma:177`, nullable) | `SetNull` | A scheduled server event that named this channel as its location keeps existing; the field clears. |
  | `AutoModRule.exemptChannelIds` (`moderation.prisma:76`, `String[]`) | none (plain ids) | A stale id remains in the array; harmless, matches the repo's existing tolerance for plain-id staleness (e.g. `forwardedFromMessageId`). |
  | `SavedMessage.channelId` (`messages.prisma:215`) | none (plain id, comment: _"Source ids carry no foreign key, so the bookmark outlives the message, channel or conversation it came from"_) | The bookmark keeps its content snapshot and stops resolving back to a live channel — already the documented behavior for a deleted message, now also true for a deleted channel. |
  | `Invite.channelId` (`servers.prisma:214`, plain id — no `channel` relation field on `Invite` at all, `servers.prisma:210-225`) | none | An invite that points a joiner at this channel keeps existing; `joinInvite` (`servers.service.ts:347-418`) returns `channelId: invite.channelId` unconditionally (`:417`) with no existence check against `Channel` — the web client must already tolerate a `channelId` it cannot find (not verified this session; flagged as an open question). |
  | `SlashCommand` | none — `SlashCommand` has no `channelId` column at all (`bots.prisma:20-36`); it is per-server, not per-channel. | Unaffected. |
  | `Interaction.channelId` (`bots.prisma:46-53`, plain id, comment: _"not a live reference that must be kept in sync if the channel… is later deleted"_) | none | Unaffected by design — already documented as a short-lived audit record. |

- `Permission.ManageChannels` (`'MANAGE_CHANNELS'`) is defined in both `apps/api/src/modules/permissions/channel-permission.ts:5` (server-side enum, re-exported from `PermissionsService`, `permissions.service.ts:12`) and `packages/shared/src/permissions.ts:5` (client-side constant used by `memberHasServerPermission`). `ChannelsService.updateChannel` (`channels.service.ts:82-86`) and `CategoriesService.deleteCategory` (`categories.service.ts:52-56`) both gate on it via `PermissionsService.requireServerPermission`.
- The realtime catalog (`packages/shared/src/realtime-events.ts:4-86`) has `ChannelUpdated: 'channel:updated'` (`:51`, added by `channel-live-settings-sync.md`) and `ServerDeleted: 'server:deleted'` (`:37`) but no `channel:deleted`. `ChannelsService.updateChannel` already emits `ChannelUpdated` to `serverRoom(channel.serverId)` with `{ serverId, channelId }` right after its DB write and after `evictUnconfirmedMembers` (`channels.service.ts:113-123`) — the exact shape this doc's delete event follows.
- Web: `useWorkspaceStore` derives the open channel from `server.channels` and already has an effect that redirects away when the active channel disappears from that array (`apps/web/src/query/useWorkspaceStore.ts:166-180`, cited by `channel-live-settings-sync.md:47`) — built for the "private channel drops out of view" case, and equally sufficient for "channel no longer exists at all" once `server.channels` no longer contains it. `useServerModeration.ts` (`apps/web/src/hooks/useServerModeration.ts:154-191`) already has a `handleChannelUpdated`-shaped listener wired into `AppShell.tsx:265`; this is the file a `handleChannelDeleted` listener joins.
- Web: `useWorkspaceNavigation.ts`'s `deleteCategory` (`apps/web/src/hooks/useWorkspaceNavigation.ts:267-292`) is the closest client-side precedent for a destructive channel-list action: it calls `DELETE /categories/:id`, then optimistically patches the cached server via `patchServer` (removing the category and clearing `categoryId` on its former channels), and falls back to an i18n error key (`error.fallback.cannot-delete-category`) on failure.
- Web UI: `ChannelSettings.tsx` (`apps/web/src/components/settings/ChannelSettings.tsx:1-423`) has no delete action today. `EditCategoryDialog.tsx` (`apps/web/src/components/workspace/EditCategoryDialog.tsx:1-90+`) is the confirm-then-delete UI precedent: a `isConfirmingDelete` boolean flips the delete button into a "confirm" button in place, rather than opening a second modal.
- i18n: `apps/web/src/i18n/locales/en/channels.ts:2-4` already has `category.action.confirmDelete`, `category.action.create`, `category.action.delete` — the naming convention a `channel.action.delete` / `channel.action.confirmDelete` pair follows. `error-codes.ts` already maps the literal `'Channel not found'` to `CHANNEL_NOT_FOUND` (`apps/api/src/common/i18n/error-codes.ts:51`), so the delete endpoint's 404 needs no new catalog entry.
- No test suite exists in this repo; `RULE.md:77` explicitly forbids adding `*.test.ts`/`*.spec.ts` files or test runners — verification is typecheck/lint/build plus a written manual scenario.

## Changes

### Rules / Flow

1. New endpoint `DELETE /channels/:channelId`, added to `ChannelsController` next to the existing `PATCH channels/:channelId` (`channels.controller.ts:34-41`), calling a new `ChannelsService.deleteChannel(userId, channelId)`.
2. `deleteChannel` looks up the channel; `404 Channel not found` if it does not exist (matches `updateChannel`'s existing `404`, `channels.service.ts:78-81`).
3. Requires `Permission.ManageChannels` on the channel's server via `PermissionsService.requireServerPermission` — the same call `updateChannel` and `deleteCategory` already make. No password/2FA reauthentication (unlike server delete) — see Trade-offs for why the bar matches category delete instead of server delete.
4. Before the DB delete, reads: the channel's `avatarUrl` (for the upload cleanup) and whether the channel is a `VOICE`/`STAGE` type with an active call (to end it) — mirroring server delete's "read before the cascade removes them" ordering (`server-ownership.service.ts:89-110`).
5. Ends any live call in the channel: `CallRegistryService.endCalls([channelId])`, unconditionally (a no-op if nobody is in a call for this channel id, per `endCalls`'s own per-participant loop, `call-registry.service.ts:139-151`). Also attempts `LivekitService.deleteRooms([channelId])` when the LiveKit transport is active, wrapped the same way `server-ownership.service.ts:167-175` wraps it (log-and-continue on failure — the channel delete must not fail because a third-party room close failed).
6. Deletes the `Channel` row with `prisma.channel.delete({ where: { id: channelId } })`. Every cascade in the Current behavior table runs as part of this single statement; no application code re-implements what the schema already does.
7. Writes an audit log: `writeAuditLog(serverId, userId, 'CHANNEL_DELETE', channelId, { name: channel.name, type: channel.type })` — matching `CATEGORY_DELETE`'s shape (`categories.service.ts:59-61`) of naming what was deleted in the metadata, since the row itself is gone.
8. Evicts every currently-joined socket from the channel's room and emits the deletion event, in that order — matching `updateChannel`'s "evict, then emit" comment (`channels.service.ts:116-118`) so a client cannot re-join a room for a channel that no longer exists:
   - `this.realtime.removeUsersFromRooms(memberUserIds, [this.realtime.channelRoom(channelId)])`, where `memberUserIds` is every member of the channel's server (fetched before the delete, same shape as server delete's `members` read, `server-ownership.service.ts:97-100`) — not just unconfirmed members, unlike `evictUnconfirmedMembers`, because *everyone* loses this room now, not only those who fail one gate.
   - `this.realtime.emitToRoom(this.realtime.serverRoom(serverId), RealtimeEvents.ChannelDeleted, { serverId, channelId })`.
9. Deletes the channel's stored avatar file if `channel.avatarUrl` is set and no other row still references the same URL: `this.uploads.deleteUploadIfUnreferenced(channel.avatarUrl)`, the same call server delete makes for its own avatar (`server-ownership.service.ts:150-156`, generalized to a single URL instead of a set).
10. Returns `{ ok: true }`, matching `deleteCategory`'s response shape (`categories.service.ts:63`).
11. **Decided**: no special-cased block for the last channel, the last `TEXT` channel, a `DECISION` channel with open proposals, or an `ANNOUNCEMENT` channel with active followers. All four cascade exactly as the schema already models. The permission bar (`ManageChannels`) and the confirm-step UI are the only guards, matching how `deleteCategory` already deletes a category with channels still in it and how `deleteServer` already deletes a server with active members, calls, and messages in it — this repo's established pattern is "the permission holder's destructive action is trusted," not per-case warnings. Recorded as a risk below and as an open question for the specific "last channel" case, since — unlike category delete — this doc could not find any other code path that already tolerates a server with zero channels.

### Edge cases

| Case | Expected behavior |
|---|---|
| Caller lacks `ManageChannels` | `403`, unchanged pattern (`requireServerPermission`). No event emitted, no DB write. |
| Channel id does not exist / already deleted | `404 Channel not found`. |
| Deleting the last channel of a server | Allowed (no guard exists anywhere else for this either, see Rules item 11) — the server ends up with zero channels. Web behavior for a channel-less server was not found in `apps/web/src/components`/`hooks` (grepped for a "no channels" empty state — no match); flagged as an open question, not assumed handled. |
| Deleting the last `TEXT` channel while other types remain | Allowed, same reasoning — the "at least one `TEXT` channel" rule only runs at server bootstrap (Scope → Out of scope). |
| Deleting a `DECISION` channel with `PROPOSED` (open) decisions | Cascaded: every `Decision` row and its `Thread` are deleted with the channel (`decisions.prisma:28`). No separate confirmation names the open-decision count; the generic confirm dialog is the only guard. |
| Deleting an `ANNOUNCEMENT` channel that other servers follow | Cascaded: every `ServerWebhook` row with `sourceChannelId` = this channel is deleted (`webhooks.prisma:23`), silently unfollowing every follower server. No notice is sent to a following server's moderators — out of scope for this doc; recorded as a risk. |
| Deleting a channel with an active voice/stage call | Every participant is disconnected from the call via `CallRegistryService.endCalls([channelId])` before the row is deleted, the same mechanism `deleteServer` already uses for every channel of a deleted server. |
| Deleting a channel with a pending `ScheduledMessage` targeting it | Cascaded: the `ScheduledMessage` row is deleted along with the channel (`messages.prisma:259`), silently — its author is not notified. Recorded as a risk. |
| Deleting a channel referenced by a `SavedMessage` bookmark | Not touched — `SavedMessage.channelId` carries no foreign key by design; the bookmark keeps its snapshot and simply can no longer resolve back to a live channel, the same as it already tolerates a deleted message. |
| Deleting a channel that has an incoming webhook posting into it | Cascaded: the `ServerWebhook` row (and its token) is deleted (`webhooks.prisma:22`); any external system still POSTing to that webhook's URL starts getting `404`s (an existing, already-established consequence of deleting the webhook's channel via `WebhooksService.remove`, not new here). |
| Deleting a channel named in an `AutoModRule.alertChannelId` | The rule keeps running; its alert delivery silently stops (`SetNull`, `moderation.prisma:83`). No warning surfaces this to the moderator who set it up — recorded as a risk. |
| Deleting a channel that is the target of an unused `Invite.channelId` | The invite keeps existing and remains joinable; a joiner is routed to a channel id that no longer resolves. **Verified after implementation**: this degrades gracefully rather than breaking. `selectChannel(id)` only records an id — the channel object is *derived* by looking that id up in the open server's `channels` (`docs/features/convention-and-scale-refactor.md:222-226`, which replaced the older `setChannel(channel)` precisely so a stored copy could not go stale). An id with no match derives to `undefined`, and the consumers read it through optional chaining (e.g. `session.channel?.type` in `ChatPanel.tsx`), so the joiner lands on the server with no channel selected instead of on a broken view. No existence check was added to `joinInvite`, and none is needed. |
| The channel currently open in a client | The client sees `channel:deleted`, refetches `serverDetail`, the channel disappears from `server.channels`, and the existing "active channel removed" effect (`useWorkspaceStore.ts:166-180`) moves them to another channel — no new client-side redirect logic needed. |
| Two delete requests for the same channel in quick succession | The first succeeds; the second's `prisma.channel.findUnique` (or the delete itself) finds nothing and returns `404` — no double audit log, no double event (matches `updateChannel`'s existing not-found path, and `deleteCategory`'s single `requireCategory` lookup). |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/src/modules/channels/channels.controller.ts` | Add `@Delete('channels/:channelId')` calling `channels.deleteChannel(user.id, channelId)`. |
| `apps/api/src/modules/channels/channels.service.ts` | Add `deleteChannel`, following Rules items 2-10; import `CallRegistryService`, `LivekitService`, `UploadsService`. |
| `apps/api/src/modules/channels/channels.module.ts` | Import `CallRegistryModule`, `LivekitModule`, `UploadsModule` (not yet imported here — `channels.module.ts` currently only imports `AuthModule`, `ServersModule`, `PermissionsModule`, `RealtimePublisherModule`). |
| `packages/shared/src/realtime-events.ts` | Add `ChannelDeleted: 'channel:deleted'` to `RealtimeEvents`, doc comment matching `ChannelUpdated`'s style: `/** { serverId, channelId } after a channel is permanently deleted; clients drop it from server.channels. */`. |
| `apps/web/src/hooks/useServerModeration.ts` | Add a `handleChannelDeleted` listener, structurally identical to the already-implemented `handleChannelUpdated` (`:164`, registered `:190`, unregistered `:198`): invalidates `queryKeys.serverDetail(payload.serverId)`. |
| `apps/web/src/hooks/useWorkspaceNavigation.ts` | Add `deleteChannel`, following `deleteCategory`'s shape (`:267-292`): `DELETE /channels/:channelId`, then `patchServer` to remove the channel from `current.channels`. |
| `apps/web/src/components/settings/ChannelSettings.tsx` | Add a delete section/button, following `EditCategoryDialog.tsx`'s confirm-in-place pattern, gated on `memberHasServerPermission(server, auth.user.id, 'MANAGE_CHANNELS')` (already imported in this file, `:13`). |
| `apps/web/src/i18n/locales/en/channels.ts`, `apps/web/src/i18n/locales/vi/channels.ts` | New keys: `channel.action.delete`, `channel.action.confirmDelete`, an `error.fallback.cannot-delete-channel` fallback matching `error.fallback.cannot-delete-category`'s pattern. |

**API contract**

- `DELETE /channels/:channelId`
- Request body: none.
- Response `200`: `{ ok: true }`.
- Errors: `403` missing `ManageChannels` · `404` channel not found.
- Socket event `channel:deleted` (new)
  - Direction: server → clients in `serverRoom(serverId)`.
  - Payload: `{ serverId: string; channelId: string }` — no channel field values, matching `channel:updated`'s id-only shape and the same reasoning (the refetch it triggers re-applies `filterViewableChannels` server-side, so there is nothing to leak by scoping the emit to the whole server room).
  - No acknowledgment; fire-and-forget, matching every other `*:updated`/`*:deleted` broadcast in this catalog.

**DB / migration**

- None. `Channel` and every table that cascades from it already have the foreign keys this doc relies on (see Current behavior's table) — no schema change, no new migration.

**Libraries** — none new; reuses `CallRegistryService`, `LivekitService`, `UploadsService`, `RealtimePublisher`, all already used by `ServerOwnershipService` for the equivalent server-delete cleanup.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): hard delete, relying on existing cascades** | Zero schema change — every cascade this doc needs already exists (built for category/server delete and for the many-to-one relations added by later features). Matches the two closest structural precedents in this module family — category delete and server delete — both hard deletes; this doc did not audit every other `delete`/`remove` path in the repo (webhooks, bans, emoji, etc.) to claim these are the *only* two. Simpler mental model: a deleted channel is actually gone, matching Discord's own behavior. | Irreversible — a `DECISION` channel's open proposals, an `ANNOUNCEMENT` channel's follows, and a channel's messages are gone with no undo. A pending `ScheduledMessage` is silently destroyed rather than cancelled with a notice. | **Chosen** — consistent with the repo's existing delete precedents; a soft-delete/trash model would be new infrastructure this repo has never needed for any other entity, for a feature that was never asked to add one. |
| B: soft delete (`Channel.deletedAt`, filtered out of every read, purged later by a sweep) | Reversible within a grace window; matches `Server.deletedAt`'s existing column (`servers.prisma:13`) in spirit. | `Server.deletedAt` is **not** actually how `deleteServer` deletes a server — it hard-deletes via `prisma.server.deleteMany` (`server-ownership.service.ts:113-116`); `deletedAt` is set by a different, unread code path this doc did not trace (not `ServerOwnershipService`), so there is no existing "soft delete a row, sweep it later" pattern to copy for `Channel`. Building one from scratch means auditing and rewriting every one of the ~20 read paths in the cascade table to filter `deletedAt: null`, a materially larger change than "add a `DELETE` endpoint." | Rejected — no existing pattern to reuse, and the scope the task asked for is "give this repo a way to delete a channel," not "add trash-can infrastructure." |
| C: require the same password/2FA reauthentication `deleteServer` requires | Consistent extra friction for every destructive delete in the app. | Deleting one channel is a much smaller blast radius than deleting an entire server (every member, every message, every call, ownership itself); `deleteCategory` — the closer precedent in scope — requires only `ManageChannels`, no reauth. Adding reauth here would make channel delete stricter than channel-privacy changes (`isPrivate`) or member bans, which is inconsistent with this repo's existing permission tiers. | Rejected — mismatched blast radius; `ManageChannels` (Rules item 3) already gates every other channel-management action including category delete. |
| D: block deletion when the channel has open decisions / active followers / a pending scheduled message, requiring the caller to resolve them first | Prevents an accidental silent loss of in-flight work. | No existing delete path in this repo (category, server) does this kind of pre-check; it would need three new queries and three new error codes for cases the schema already has cascades for, and no requirement in the task named this as required behavior. | Rejected for v1 — recorded as an open question instead, since it is a real product question (should deleting a `DECISION` channel with open proposals warn the actor?) that this doc cannot answer by reading code alone. |

What the chosen option (A) costs: no recovery path for a channel deleted by mistake — the same cost `deleteCategory` and `deleteServer` already accept — and three specific silent losses called out above (open decisions, announcement followers, pending scheduled messages) that a future doc could soften with a warning, without changing the underlying hard-delete/cascade mechanism.

## Risks & rollback

- **What can break**: nothing existing — this is an additive endpoint and an additive realtime event; no existing read or write path changes behavior. The only new destructive capability is the endpoint itself.
- **Not covered**: a warning to the actor before deleting a channel with open decisions, active announcement followers, or a pending scheduled message (Trade-offs, option D) — these are silently cascaded, matching every other cascade this doc relies on, but are a materially different kind of loss (in-flight moderation/business state, not just messages) that a reviewer may want flagged before this ships.
- **Not covered**: any notice to a following server's moderators when the announcement channel they followed is deleted (their `ServerWebhook` follow row is simply gone).
- **Not covered**: the "zero channels" or "zero `TEXT` channels" state of a server after this ships — this doc could not confirm the web client already handles an empty `server.channels` array gracefully (open question below).
- **Rollback**: revert the code. No migration to unwind. Any channel already deleted through this endpoint before a rollback is not recoverable — the cascade already ran (same irreversibility `deleteCategory`/`deleteServer` already carry).

## Test plan

Not covered by automated tests (`RULE.md:77` forbids `*.test.ts`/`*.spec.ts` files in this repo). Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run i18n:check`.

**Manual**

1. As a member with `ManageChannels`, delete a `TEXT` channel with messages, pins, and a thread → `200 { ok: true }`; the channel disappears from `GET /servers/:serverId/channels` and from every other open client's sidebar within one refetch cycle, without reloading.
2. A member who has the deleted channel open when it is deleted → their view redirects to another channel (or an empty state) without a manual reload, via the existing `useWorkspaceStore` "active channel removed" effect.
3. Delete a `VOICE` (or `STAGE`) channel while a member is actively in its call → their client's call UI ends the call; verify via `CallRegistryService`'s participant state (or the client's own call teardown) that nobody is left "in" a call for a channel id that no longer exists.
4. Delete a `DECISION` channel with at least one `PROPOSED` decision → the decision and its thread are gone; `GET` on the decision's former id returns `404`.
5. Delete an `ANNOUNCEMENT` channel that another server follows → the follower's channel settings no longer lists the follow (verified via that server's `Followed channels` section, `FollowedChannelsSection`).
6. Delete a channel with a pending `ScheduledMessage` targeting it → the scheduled message no longer appears in the author's scheduled-messages list.
7. **Failure case**: a member without `ManageChannels` calls `DELETE /channels/:channelId` → `403`; the channel still exists afterward.
8. **Failure case**: call `DELETE /channels/:channelId` with an id that does not exist (or was already deleted) → `404`.
9. Delete the last channel of a server → confirm what the web client actually renders for a server with zero channels (this is the open question this test exercises, not an assumed-passing case).

## Deployment notes

- New env vars: none.
- Migration: none — no schema change.
- Cache/queue to clear: none.
- `overview.md`: this menu (`docs/features/`) uses flat per-feature files, not a menu `overview.md` — no such file to update.
- Shared package (`packages/shared`) must be rebuilt before the API/web build (`npm run build:shared`), since `RealtimeEvents.ChannelDeleted` is a new export both apps import.
- New i18n keys land in both `en` and `vi` catalogs in the same change; run `npm run i18n:check` before merging the web change.
- Breaking API change: none — `DELETE /channels/:channelId` is a new, additive endpoint; no existing client behavior changes for a client that never calls it.
