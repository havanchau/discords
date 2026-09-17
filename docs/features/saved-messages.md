# Feature Spec: Saved Messages

Lets a user bookmark any channel or direct message they can read, and optionally set a reminder that resurfaces it later through the existing notification inbox.

## Goal

A user saves a message from either surface, sees all their saved messages in one list, and — if they set a reminder time — gets a notification (and a push, if enabled) when it is due, even if the original message or their access to it is gone by then.

Acceptance criteria:

- `POST /saved-messages` saves a channel message or a direct message the caller can currently read, with an optional `remindAt`.
- `GET /saved-messages` lists the caller's saved messages, newest-saved first, each showing whether the source message is still reachable.
- `DELETE /saved-messages/:id` un-saves it; only the owner can do this.
- A due reminder creates a `Notification` for the owner and, if push is enabled and the owner is not `ONLINE`, a push notification — reusing the existing inbox and push paths rather than a new delivery channel.
- If the owner loses read access to the source channel/conversation, or the message is deleted, before the reminder fires, the reminder still fires (it points at a saved snapshot), but opening it shows "message no longer available" instead of navigating to a broken link.
- Saving the same message twice by the same user is idempotent (returns the existing bookmark, updating `remindAt` if a new one is given).

## Scope

- **In scope**: `SavedMessage` model, save/list/delete endpoints, an optional one-shot reminder per saved message, a reminder sweep that delivers through `NotificationsService`/`PushService`, "Save message" action on channel and DM messages, a "Saved Messages" list view.
- **Out of scope**: saving message threads or whole conversations, recurring/repeating reminders, saving attachments as separate objects (the snapshot references the original attachment URLs only), sharing a saved message with another user, folders/tags.

## Current Behavior

- Channel messages carry no bookmark concept; the closest existing per-user marker is `MessagePin` (server-visible, not per-user) and `ReadState`/`DirectReadState` (read position, not a save) — `apps/api/prisma/schema.prisma:432-439`, `:443-452`, `:610-618`.
- Channel message actions (reply, react, pin, delete) live in `useChannelMessageActions.ts`, introduced specifically to hold per-message actions out of `AppShell.tsx` (`docs/features/member-timeout-and-slowmode.md`); DM message actions are documented separately in `docs/features/dm-message-actions.md`.
- `NotificationsService.create` already accepts a free-form `type` string and optional `channelId`/`messageId`/`conversationId`, and emits `notification:created` to the owner's user room (`apps/api/src/modules/notifications/notifications.service.ts:36-49`); existing callers are `direct-messages.service.ts:119`, `dm-calls.service.ts:149`, and `friends.service.ts:107,159` — no channel-message caller exists yet, so a reminder would be the first `type` sourced from a channel message.
- `PushService.sendMentionPush` is the only push sender today and is hard-coded to the "channel message" template and to `NotificationPreference` muting rules (`apps/api/src/modules/push/push.service.ts:62-113`); it takes a channel-shaped input and is not reusable as-is for a reminder.
- There is no scheduler dependency (`@nestjs/schedule` is not installed, confirmed in `docs/features/i18n-localization.md`'s reading of `apps/api/package.json`); the one precedent for a recurring in-process timer is `RealtimeHeartbeatService`, which runs plain `setInterval` sweeps un-refed so they do not keep the process alive on their own (`apps/api/src/modules/realtime/realtime-heartbeat.service.ts:32-39`).
- Read access is checked per request, not cached: `ChannelsService.requireReadableChannel(userId, channelId)` (`apps/api/src/modules/channels/channels.service.ts:155`) is what every message endpoint calls; there is no equivalent standing "can this user still read this" flag stored anywhere.

## Changes

### Rules

- Saving requires the caller to currently pass the same read check the source surface already uses: `ViewChannel` through `PermissionsService.hasChannelPermission` for a channel message (the check `requireReadableChannel` makes, called directly so a missing permission is answered as `404` rather than caught as `403`), membership in `DirectConversationMember` for a DM message. A deleted message cannot be saved either. Failing either returns `404` (message not found), matching the pattern other endpoints use to avoid leaking existence.
- The save stores a **snapshot** at save time (`content`, `authorId`, the author's display name at that moment in `snapshotAuthorName`, channel/conversation id, server id if applicable; text only, attachments are not snapshotted) so the list renders even if the live message is later edited or deleted; it does not live-sync with edits.
- `remindAt`, when given, must be at least 1 minute and at most 1 year in the future; omitted means "save only, no reminder".
- One outstanding reminder per saved message; setting a new `remindAt` on an already-reminded save replaces the pending one (still not-yet-fired only — a fired reminder cannot be rescheduled: `409 Reminder was already sent`; un-save and save again instead). Saving again without `remindAt` keeps the existing reminder; there is no "clear reminder" action.
- A reminder sweep runs every 60 seconds on every API instance, selects up to 100 saved messages with `remindAt <= now()` and `remindedAt IS NULL`, and for each first **claims** it with a conditional `UPDATE ... SET remindedAt = now WHERE id = ? AND remindedAt IS NULL AND remindAt <= now` (`updateMany`, affected-row count checked). Only the instance whose claim affected the row delivers: it creates a `Notification` (`type: 'SAVED_MESSAGE_REMINDER'`, title/body in the owner's locale) for the owner and attempts a push through `PushService.sendGenericPush`. Claiming before delivering makes delivery at-most-once across instances (`rules/backend-nestjs.md` read-modify-write guidance): a delivery that fails after its claim is logged and not retried.
- Visibility re-check happens at **read time**, not at save or reminder time: `GET /saved-messages` (and the `POST` response) carries `isAccessible: boolean`, computed by re-running the same read check the save used and requiring the live message to still exist and not be deleted. The reminder notification does not carry the flag: it is stored without `channelId`/`conversationId` (only `messageId`), and opening it opens the Saved Messages list, which recomputes access; the UI shows "message no longer available" and disables "Jump to message" when `false`, but never deletes the bookmark or the snapshot — the user keeps their saved text.
- Un-saving is owner-only; a saved-message id that exists but belongs to another user returns `404`, same "existence is not leaked" rule as saving.

### Client

- "Save message" is a bookmark button in the hover action bar of channel messages (`MessageRow.tsx`) and DM messages (`DirectMessageRow.tsx`). It is a self-contained `SaveMessageAction` component reading the saved list from React Query, rather than an entry threaded through `useChannelMessageActions.ts` and the DM actions hook, so neither hook nor the memoized rows' props change. It opens a popover with the reminder picker (presets plus a `datetime-local` field) and "Save message", or, once saved, "Update reminder" and "Remove from Saved". There is no context-menu entry.
- A new "Saved Messages" bookmark button in the server rail (`ServerRail.tsx`, visible on both the server and Home surfaces) opens a dialog; its open state is `openSavedMessages` on `WorkspaceContext`, because both the rail and the notification inbox open it. The list shows: snapshot content, author, source label (channel/server name or DM participant), saved date, pending reminder time if any, "Jump to message" (disabled when `isAccessible` is `false`), and a remove button; loading, empty, and error states. "Jump to message" opens the source channel (`openServer` + `selectChannel`) or DM conversation; it does not scroll to the message itself, and a DM whose conversation is not in the loaded conversation list shows an error instead. The channel label comes from `channelName`/`serverName` in the response; the DM label from the client's conversation list.
- A reminder notification appears in the existing notification inbox/bell like any other `NotificationItem`, using its `title`/`body`; clicking it marks it read and opens Saved Messages (`UtilityPanel.tsx`), where the jump is offered only if the message is still accessible.
- New strings (action label, reminder picker, list empty state, "message no longer available") go into `apps/web/src/i18n/locales/en.ts` and `vi.ts`.

## Technical Approach

### Data model

```prisma
model SavedMessage {
  id                String    @id @default(cuid())
  ownerId           String
  sourceType        SavedMessageSourceType
  channelId         String?
  conversationId    String?
  serverId          String?
  originalMessageId String
  snapshotContent   String
  snapshotAuthorId  String
  snapshotAuthorName String
  remindAt          DateTime?
  remindedAt        DateTime?
  createdAt         DateTime  @default(now())
  owner             User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@unique([ownerId, sourceType, originalMessageId])
  @@index([ownerId, createdAt])
  @@index([remindAt, remindedAt])
}

enum SavedMessageSourceType {
  CHANNEL
  DIRECT
}
```

Migration `20260917001000_add_saved_messages`. `channelId`/`conversationId`/`serverId` are denormalized ids without a relation constraint (no `onDelete` cascade to a `Channel`/`DirectConversation`) so a saved message survives the source being deleted — the same reasoning `docs/features/message-reports.md` uses for `Message` with `onDelete: SetNull`, taken one step further here because even the id must stay for the "no longer available" label to explain what was lost.

### API

| Method   | Path                  | Body                                   | Response                                               | Rate limit |
| -------- | --------------------- | -------------------------------------- | ------------------------------------------------------ | ---------- |
| `POST`   | `/saved-messages`     | `{ sourceType, messageId, remindAt? }` | `201 { savedMessage }` (or `200` if it already exists) | 30/min     |
| `GET`    | `/saved-messages`     | —                                      | `{ savedMessages: SavedMessageView[] }` (max 100)      | default    |
| `DELETE` | `/saved-messages/:id` | —                                      | `{ ok: true }`                                         | 30/min     |

`SavedMessageView` (`packages/shared/src/api-contract.ts`): `{ id, sourceType, snapshotContent, snapshotAuthor: { id, displayName, avatarUrl }, channelId, conversationId, serverId, originalMessageId, channelName, serverName, remindAt, remindedAt, isAccessible, createdAt }`. `snapshotAuthor.displayName` is the snapshot; `avatarUrl` is read live. `channelName`/`serverName` are filled only while `isAccessible`. `remindAt` outside 1 minute – 1 year returns `400`; an unknown or unreadable message returns `404 Message not found`; another user's or an unknown saved-message id returns `404 Saved message not found`.

### Realtime

- No new socket room. Save/list/delete are pull-based like the rest of settings-style lists. Reminder delivery reuses the existing `notification:created` (to `userRoom(ownerId)`) and `notification:unread` events (`apps/api/src/modules/notifications/notifications.service.ts:44-48`, `:74-79`), so the client's existing inbox subscription needs no change.

### Files

- API: `modules/saved-messages/saved-messages.module.ts`, `saved-messages.controller.ts`, `saved-messages.service.ts` (save/list/delete and the read-time access check), `reminder-sweep.service.ts` (the `setInterval` sweep, modeled on `realtime-heartbeat.service.ts:32-39`, started on application bootstrap), `saved-message-reminder.ts` (reminder window and sweep constants), `dto/create-saved-message.dto.ts`, `push/push.service.ts` (adds `sendGenericPush(userId, { title, body, url })`; the subscription delivery loop is factored out of `sendMentionPush` and shared), `common/i18n/error-codes.ts` and `locales/{en,vi}.ts` (new error messages and the reminder title/body), `app.module.ts`, `prisma/schema.prisma`.
- Shared: `packages/shared/src/api-contract.ts` (`SavedMessageView`, `CreateSavedMessageInput`, `SavedMessageSourceType`).
- Web: `api.ts`, `query/queryKeys.ts`, `hooks/useSavedMessages.ts`, `components/saved/SaveMessageAction.tsx`, `SavedMessagesPanel.tsx`, `SavedMessageRow.tsx`, `ReminderPicker.tsx` (each with its `.module.css`), `components/chat/MessageRow.tsx`, `components/home/DirectMessageRow.tsx`, `components/chat/UtilityPanel.tsx`, `components/workspace/ServerRail.tsx`, `components/WorkspaceSidebar.tsx`, `components/app/AuthenticatedWorkspace.tsx`, `contexts/WorkspaceContext.tsx`, `AppShell.tsx`, `i18n/locales/en.ts`, `vi.ts`.

## Trade-offs

- **Snapshot copy vs. a live reference to `Message`/`DirectMessage`**: a live reference breaks the moment the message is edited, deleted, or the user loses channel access — exactly the cases this feature must survive gracefully; the cost is the saved text can drift from a later edit of the original, which the UI does not attempt to reconcile.
- **`setInterval` sweep vs. `@nestjs/schedule`/a queue**: matches the repository's existing choice for `docs/features/server-events.md` (no job infrastructure installed) and the precedent in `RealtimeHeartbeatService`; a 60-second sweep resolution is acceptable for a reminder feature (not a payment or an alert with SLA). Cost: reminders are not millisecond-precise and every API instance runs its own timer, so the sweep's `UPDATE ... WHERE remindedAt IS NULL` must be the only place that decides delivery — a plain read-then-write would double-send under two instances.
- **Reusing the notification inbox/push vs. a dedicated reminder channel**: the inbox and push paths already handle preference muting, throttling, and locale (`PushService.shouldSendPush`, `:114-132`; i18n resolution, `:76`); building a parallel delivery path would duplicate all of that for one notification type. Cost: a reminder is subject to the same "recipient is `ONLINE` skips push" rule as a mention, which may surprise a user expecting a reminder to always push.
- **Access re-check at read time vs. at save/reminder time**: access can change after either of those moments (a member is removed from the channel later), so caching an `isAccessible` flag would go stale; recomputing on every `GET` costs one permission check per distinct source channel (DM membership and message liveness are one batched query each) but stays correct. Cost: the list endpoint is `O(channels)` permission checks; acceptable at the `max 100` page size.

## Deviations From The Original Design

- **Jump to message (2026-09-17):** "Jump" now also scrolls to the saved message. A pending jump (`apps/web/src/utils/pendingMessageJump.ts`, 10 s lifetime) is set before the channel or conversation opens and runs once that view has loaded the message; a message older than the loaded history is not reached. See [wave-3-2-follow-ups.md](./wave-3-2-follow-ups.md).

## Risks & Rollback

- **Risk**: the sweep is a per-instance in-process timer with no distributed lock beyond the conditional claim. Because the claim runs before any delivery and only the instance whose claim affected the row delivers, two instances never both send the notification or the push. The cost is at-most-once delivery: if the process dies, or the notification/push call fails, between the claim and the delivery, that reminder is lost (logged, not retried).
- **Risk**: snapshotting content at save time means a saved message shows stale text forever if the original is later edited — by design, but worth surfacing to reviewers since it differs from how pins behave (pins show the live message).
- **Risk**: the snapshot stores the content as the server holds it, so a message from an end-to-end encrypted channel is saved and shown as ciphertext; decrypting snapshots client-side is not implemented.
- **Risk**: `sendGenericPush` applies the "online users get no push" rule and the global desktop-notification preference, but not per-server/per-channel mutes or the per-channel push throttle, since a reminder is a one-off the user asked for.
- **Rollback**: revert code; the migration is additive and the sweep service simply is not registered.

## Test Plan

- **Manual**: user saves a channel message with a reminder 2 minutes out → it appears in Saved Messages with the pending time → after 2 minutes (sweep interval permitting) a notification arrives in the inbox and, if push is enabled and the user is away, a push notification too.
- **Manual**: user saves a DM message with no reminder → it appears in the list with no reminder time and no notification ever fires for it.
- **Manual**: user is removed from a server, then opens Saved Messages → the saved message from that server's channel still appears with "message no longer available" and a disabled jump action.
- **Failure case**: user attempts to save a message in a private channel they cannot read → `404`; nothing is created.

## Deployment Notes

- Run migration `20260917001000_add_saved_messages` before deploying the API.
- The reminder sweep starts with the API process; no separate worker deploy is needed, consistent with `RealtimeHeartbeatService`'s in-process model.
- Add the new saved-messages strings to `en.ts` and `vi.ts` and run `npm run i18n:check`.
