# DM Push Notifications

- **Status**: draft — awaiting review
- **Date**: 2026-09-25
- **Related**: `docs/features/timed-notification-mute.md`, `docs/features/open-questions.md` (#41, #42)

## Goal

Today a direct message never sends a web push: it only creates an in-app `Notification` row (`apps/api/src/modules/direct-messages/direct-messages.service.ts:168-180`). A recipient who is offline or has the tab closed gets no signal at all until they reopen the app, unlike a channel mention, which already triggers a push (`apps/api/src/modules/messages/messages.service.ts:757` → `PushService.sendMentionPush`).

This also unblocks `docs/features/open-questions.md` #41: per-conversation DM mute was explicitly deferred because "DMs send no push today ... a DM mute would have no observable effect until DM push ... exists." This doc makes DM push exist; per-conversation mute itself stays a separate follow-up (see Scope).

**Acceptance criteria**:

- [ ] Sending a direct message to a recipient who is offline (or has `desktopEnabled: false` on their global `NotificationPreference`, or has an active global mute) results in a web push delivered to that recipient's push subscriptions, the same delivery path channel mentions already use (`PushService.deliver`, `push.service.ts:141-163`).
- [ ] A recipient who is `ONLINE`, has muted notifications globally, or has turned off desktop notifications globally receives no DM push — consistent with how `shouldSendPush` already gates channel mentions.
- [ ] A failure to send the push (missing VAPID keys, a dead subscription, a network error) never fails the `POST /direct-conversations/:conversationId/messages` request — the message is already durably created before the push is attempted.
- [ ] The push body never leaks more than the existing in-app `Notification` already stores for the same message, and follows the repo's i18n pattern (no hardcoded strings).

## Scope

**In scope**

- Sending a web push to each DM recipient when a direct message (including a forwarded message and a direct poll, both of which go through the same `announceCreatedMessage`) is created, using the existing `PushService` / VAPID delivery machinery.
- A new `PushService.sendDirectMessagePush` method and a global-only mute/desktop check, wired from `DirectMessagesService.announceCreatedMessage`.
- New i18n keys for the push title/body in `apps/api/src/common/i18n/locales/en.ts` and `vi.ts`.

**Out of scope**

- **Per-conversation DM mute.** `NotificationPreference` has no `conversationId` column (`apps/api/prisma/models/notifications.prisma:1-17`, confirmed again while writing this doc). This change only makes the existing **global** mute/desktop scope apply to DM push (the same global row already gates channel push via `shouldSendPush`'s global check, `push.service.ts:184-193`). A user cannot mute one specific DM conversation's push without muting all DM push — that remains the deferred work named in open question #41, now technically unblocked but not designed here.
- Detecting whether the recipient currently has that exact conversation open in their client and suppressing push for that case. No such "active conversation" tracking exists anywhere in the realtime layer today (grepped for `activeConversation`/`focusedChannel`/similar across `apps/api/src/modules/realtime/` and `messages.service.ts` — none found), and channel mention push does not do this either (`shouldSendPush` only checks `user.status === 'ONLINE'`, not per-channel focus). DM push follows the same precedent: online/offline is the only presence signal used.
- Per-conversation push rate limiting. Channel mentions throttle via `PushNotificationThrottle` keyed on `(userId, channelId)` (`push.service.ts:196-211`); DMs have no `channelId`. See Trade-offs for why this is deliberately left out rather than reusing that table with a mismatched key.
- Group-DM-specific push copy (e.g. showing the group name vs. the sender's name) beyond what the existing `Notification.title` logic already computes — reused as-is (`directMessageNotificationTitle`, referenced at `direct-messages.service.ts:174`, not modified here).
- Any change to the in-app `Notification` row DMs already create, or to unread-count behavior.

## Current behavior

- `DirectMessagesService.createMessage` creates the `DirectMessage` row, then calls `announceCreatedMessage` (`direct-messages.service.ts:142`), which is not wrapped in a Prisma transaction — the message row is already committed by the time `announceCreatedMessage` runs.
- `announceCreatedMessage` (`direct-messages.service.ts:151-180`): marks the author's own read state, emits `dm:created` over the socket rooms, emits `dm:unread` counts, then for every recipient calls `this.notifications.create({ userId, actorId, type: 'DIRECT_MESSAGE', title, body, conversationId })` (`:168-180`) — an in-app row only, no push call anywhere in this file (grepped for `PushService`/`push\.` in `direct-messages.service.ts` and `direct-messages.module.ts` — no match).
- `DirectMessagesModule` (`direct-messages.module.ts:1-17`) imports `AuthModule`, `PrismaModule`, `NotificationsModule`, `RealtimePublisherModule` — not `PushModule`.
- Channel mention push, the pattern to imitate: `MessagesService.notifyMentionedUsers` (`messages.service.ts:727-769`) is called from `createMessage` right after the message row is created (`messages.service.ts:264`, no transaction wrapper either), checks `ViewChannel` per mentioned user, then calls `this.push.sendMentionPush({...})` (`:757-765`) **without a `try/catch`** — if `sendMentionPush` throws, the rejection propagates out of `Promise.all` and out of `notifyMentionedUsers`, which is `await`ed by `createMessage`. This means today a push failure on the channel path can fail the whole "send message" request even though the message row is already committed. This doc does not fix that existing gap on the channel path, but the new DM code must not repeat it (see Changes → non-DB side effect).
- `PushService.sendMentionPush` (`push.service.ts:71-105`): skips self-mentions, calls `shouldSendPush(toUserId, serverId, channelId)`, loads the user's push subscriptions, applies a per-`(userId, channelId)` rate limit (`reserveRateLimit`, `:196-211`), builds an i18n'd payload, and calls `deliver`.
- `PushService.shouldSendPush` (`push.service.ts:170-194`): returns `false` if the recipient is `ONLINE`; otherwise loads all of the recipient's `NotificationPreference` rows, picks the global row (`serverId: null, channelId: null`), the server row, and the channel row independently, returns `false` if the global row's `desktopEnabled === false`, and returns `false` if `isMuteActive` is true for the channel, server, or global row (`:184-193`) — `isMuteActive` (`apps/api/src/modules/users/notification-mute.ts:36-40`) treats `mutedUntil === null` as "muted forever" and a past `mutedUntil` as not muted.
- `PushService.isPushAllowed` (`push.service.ts:156-163`, used by `sendGenericPush` for saved-message reminders) checks only `ONLINE` status and the global row's `desktopEnabled` — it does **not** consult `muted`/`isMuteActive` at all, by design (reminders bypass mute, per `timed-notification-mute.md`). This is a different, narrower check than `shouldSendPush` and is not the right one to reuse for DM push, since a DM should respect a global mute.
- `PushService.deliver` (`push.service.ts:141-163`) already fails soft: each subscription send is wrapped in `Promise.allSettled` + an inner `try/catch` that logs a `warn` and deletes dead (404/410) subscriptions; a delivery error never throws out of `deliver`.
- VAPID config is read via `ConfigService` inside `PushService.sendNotification` (`push.service.ts:222-249`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` (default `mailto:admin@localhost`); missing keys log a `warn` and return without sending (`:228-233`) — no exception.
- i18n: `push.channelMessage.title` / `.body` / `.ageRestrictedBody` exist in `apps/api/src/common/i18n/locales/en.ts:272-274` (and the matching `vi.ts` keys); resolved per-recipient locale via `I18nService.resolveUserLocale` (`push.service.ts:88`).
- `CreateDirectMessageDto` (`apps/api/src/modules/direct-messages/dto/create-direct-message.dto.ts`) has no client-supplied idempotency/request id; a duplicate `POST` today creates a second `DirectMessage` row. This is a pre-existing gap in the create-message endpoint itself, not introduced or fixed by this change (see Technical approach → idempotency).

## Changes

### Rules / Flow

1. `DirectMessagesModule` imports `PushModule` and `DirectMessagesService` gets `PushService` injected, mirroring how `MessagesModule` already does it (`messages.module.ts:6,18`, `messages.service.ts:23`).
2. `PushService` gains a public `sendDirectMessagePush(input: { toUserId, fromUserId, fromUsername, conversationId, title, body })` method:
   - Skips if `toUserId === fromUserId` (defensive; `getConversationRecipientIds` already excludes the author, `direct-messages.service.ts:187-193`, but this matches the same guard `sendMentionPush` has at `:72`).
   - Calls a new private `shouldSendDirectMessagePush(userId)`: returns `false` if the recipient is `ONLINE`; otherwise loads only the **global** `NotificationPreference` row (`serverId: null, channelId: null` — there is no server/channel scope for a DM) and returns `false` if `desktopEnabled === false` or `isMuteActive(globalPreference, now)` is true. This is the global-only slice of the existing `shouldSendPush` logic, not a new mute model.
   - Loads the recipient's `PushSubscription` rows; returns early if none.
   - No per-conversation rate limit is applied (see Trade-offs) — every DM message that passes the mute/online check sends one push per delivery, matching the 1:1 nature of a DM (the `PushNotificationThrottle` table is per-`channelId` and stays untouched by this change).
   - Builds the payload via `I18nService`, using new keys `push.directMessage.title` (`{sender}` for a 1:1 conversation, the conversation/group name for a group DM — reuse whatever `directMessageNotificationTitle` already computes for the in-app `Notification.title`, `direct-messages.service.ts:174`, so the two never drift) and `push.directMessage.body` (`{content}`, truncated the same way `sendMentionPush` truncates channel content — `truncate(content, 100)`, `push.service.ts:100`).
   - `data.url` points at the conversation, e.g. `/channels/@me/${conversationId}` — the exact client route is read from the web router before implementation, not invented here.
   - Delivers via the existing `deliver` method — no new HTTP/WebPush code.
3. `DirectMessagesService.announceCreatedMessage` calls `sendDirectMessagePush` once per recipient, **after** the existing `notifications.create` loop (`:168-180`), wrapped so a push failure cannot fail the request (see Technical approach → non-DB side effect). Both a 1:1 and a group conversation use the same call; a direct poll (which also calls `announceCreatedMessage`, per the method's own doc comment at `:146-150`) gets a DM push too, with the same title/body fields the in-app notification already uses for it.

### Edge cases

| Case                                                                        | Expected behavior                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipient `status = ONLINE`                                                 | No push (same rule as channel mentions).                                                                                                                                                                                                                                                                               |
| Recipient globally muted (`isMuteActive` true on the global preference row) | No push. A server- or channel-scoped mute row is irrelevant here — DMs have no server/channel.                                                                                                                                                                                                                         |
| Recipient has `desktopEnabled: false` globally                              | No push.                                                                                                                                                                                                                                                                                                               |
| Recipient has no `PushSubscription` rows                                    | No-op, same as `sendMentionPush` today.                                                                                                                                                                                                                                                                                |
| VAPID keys missing in this environment                                      | No push sent, warning logged, request still succeeds (existing `sendNotification` behavior, unchanged).                                                                                                                                                                                                                |
| Push delivery throws (network error, non-404/410 HTTP error)                | Logged as a `warn` inside `deliver`/`sendDirectMessagePush`'s own error handling; the DM create request still returns `201` with the message.                                                                                                                                                                          |
| Message has no text (forward-only, or attachment-only)                      | Body falls back the same way the in-app `Notification.body` already does: `message.content \|\| message.forwardOrigin?.content \|\| ''` (`direct-messages.service.ts:175`), truncated; an empty body after that renders as an empty string in the push, same as the in-app notification today — no new special-casing. |
| Duplicate `POST .../messages` (client retry)                                | Out of scope: the endpoint has no idempotency key today (see Current behavior); a retry creates a second `DirectMessage` row and a second push, exactly as it would create a second in-app `Notification` today. Not introduced or worsened by this change.                                                            |
| Group DM with 5+ members                                                    | Push fans out to each recipient independently, same as `notifyMentionedUsers` fans out per mentioned user; no batching change.                                                                                                                                                                                         |

## Technical approach

**Files touched**

| File                                                              | Change                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/push/push.service.ts`                       | Add `sendDirectMessagePush(input)` and private `shouldSendDirectMessagePush(userId)`.                                                              |
| `apps/api/src/modules/direct-messages/direct-messages.service.ts` | Inject `PushService`; call `sendDirectMessagePush` per recipient inside `announceCreatedMessage`, isolated from the request's own success/failure. |
| `apps/api/src/modules/direct-messages/direct-messages.module.ts`  | Import `PushModule`.                                                                                                                               |
| `apps/api/src/common/i18n/locales/en.ts`, `vi.ts`                 | Add `push.directMessage.title`, `push.directMessage.body`.                                                                                         |

**API contract**

No endpoint shape changes. `POST /direct-conversations/:conversationId/messages` (`direct-messages.controller.ts:91`) keeps its existing request/response; this change only adds a side effect after the response-producing write.

**DB / migration**

None. No schema change — `PushSubscription`, `NotificationPreference`, and `PushNotificationThrottle` are all reused as-is.

**Non-DB side effect and failure handling** (`rules/failure-and-state.md`):

1. **What can fail**: the push subscription/preference reads (Prisma), the VAPID delivery HTTP call (network, provider error), the i18n lookup. None of these touch the `DirectMessage` row itself.
2. **State after a failure**: the message row, the in-app `Notification` rows, and the read/unread state are already committed before any push is attempted (`announceCreatedMessage` runs after `directMessage.create`, `direct-messages.service.ts:142`, and the push call is placed after the existing `notifications.create` loop, `:168-180`). A push failure leaves the DM itself fully delivered in-app and over the socket; only the push notification is missing. Nobody needs to "repair" this — there is no retry queue for the push itself, matching how `sendMentionPush` already behaves for channel mentions (a missed push is not currently reconciled anywhere in this repo).
3. **What happens on a duplicate trigger**: `sendDirectMessagePush` is called exactly once per created `DirectMessage` row, in-process, in the same request that created it — it is not a separately retried job or webhook, so there is no independent "arrives twice" case to key an idempotency check on. If this code is later moved to a queue (see Trade-offs), the consumer would need to dedupe on the `DirectMessage.id`; not needed for the in-process call implemented here.
4. Concretely: the `sendDirectMessagePush` call in `announceCreatedMessage` is wrapped in its own `try/catch` (or `Promise.allSettled` across recipients, consistent with how `deliver` already isolates per-subscription failures), logging a `warn` with the recipient id and conversation id (never message content) on failure, and never rethrowing — so a push error can never turn a successfully created DM into a `5xx` response. This is the one deliberate deviation from the channel-mention pattern (`notifyMentionedUsers` → `sendMentionPush` is awaited with no such guard today, Current behavior) — DM push does not repeat that gap.

**Libraries** — none new; reuses the existing `web-push` VAPID signing/encryption already in `push.service.ts` (`createVapidJwt`, `encryptWebPushPayload`).

## Trade-offs

| Option                                                                                                                            | Pros                                                                                                                                                                                   | Cons                                                                                                                                                                                                                                                                                        | Verdict                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (chosen): call `PushService.sendDirectMessagePush` directly from `DirectMessagesService.announceCreatedMessage`, in-process** | Matches the exact pattern already used for channel mentions (`notifyMentionedUsers` → `sendMentionPush`); no new infrastructure; failure isolated with a `try/catch` at the call site. | Push delivery (an HTTP call per subscription) now runs inside the request that creates the DM, adding latency to the response unless it is fire-and-forget (not awaited) or wrapped so it cannot block the response either.                                                                 | Chosen — smallest change, consistent with the repo's one existing push trigger; the latency concern is addressed by not awaiting delivery synchronously in the response path (see note below) rather than by adding a queue. |
| B: publish a `directMessage.created` event and let a queue consumer send the push                                                 | Fully decouples push delivery from the request; natural place to add retry/backoff later.                                                                                              | The repo has no message queue or job scheduler installed today (confirmed absent in `timed-notification-mute.md` and `saved-messages.md` Current behavior sections); introducing one is a much larger, unrelated infrastructure change for a single push call.                              | Rejected — disproportionate to the change; revisit only if DM volume or reliability needs later justify a queue.                                                                                                             |
| C: reuse `PushNotificationThrottle` (keyed by `channelId`) for DM rate limiting, passing `conversationId` as `channelId`          | No new table                                                                                                                                                                           | The column is named and typed for a channel; storing a conversation id under it is a silent field-repurposing (`rules/code-design.md`: "never repurpose a field — add one"), and it would make a channel and a DM conversation collide if their ids ever matched by construction elsewhere. | Rejected — DM push ships with no per-conversation throttle rather than misuse an existing column; a dedicated throttle can be added later if DM push spam becomes a real problem.                                            |
| D: no rate limit for DM push at all (chosen alongside A)                                                                          | Simple; a burst of DMs is a burst of real messages the user asked to be notified about, unlike a mention which can fan out from one message to many channel members.                   | A very chatty sender could generate many pushes in a short time to an offline recipient.                                                                                                                                                                                                    | Chosen — acceptable for v1; flagged as a known risk below rather than solved with a mismatched table.                                                                                                                        |

What the chosen option costs: one additional Prisma round trip (global preference + subscriptions) and, when subscriptions exist, one outbound HTTPS call per subscription, on the DM-send request path unless implemented as non-blocking (see Risks). No new coupling beyond `DirectMessagesModule` depending on `PushModule`, the same dependency `MessagesModule` already has.

## Risks & rollback

- **What can break**: if `sendDirectMessagePush` is awaited synchronously in the response path (rather than fire-and-forget after the response is queued), a slow or hanging push provider adds latency to every DM send. Mitigation to decide at implementation time: either `await` it (simplest, consistent with `notifyMentionedUsers`, and bounded because `deliver` uses `Promise.allSettled` with no explicit per-call timeout today — note: `fetch` inside `sendNotification`, `push.service.ts:236`, has no timeout either, an existing gap on the channel path too) or don't await it and let it run after the response is sent. This doc recommends **await it**, for consistency with the one existing push trigger and because the volume (one recipient set per DM) is much smaller than a channel mention fan-out; if push latency turns out to matter in practice, revisit.
- **Not covered**: per-conversation DM mute (Scope), "recipient has this conversation open" suppression (Scope), DM-specific rate limiting (Trade-offs).
- **Rollback**: revert the code; no migration, no schema change, no stored data introduced. Reverting removes the DM push call and its i18n keys with no cleanup needed.

## Test plan

Not covered by automated tests (repo has no test suite by policy).

**Manual**

1. User A sends a DM to offline User B (B has a saved push subscription, default preferences) → B receives a web push titled with A's name/conversation title and a truncated body; the existing in-app `Notification` row is still created exactly as before.
2. User B sets their global `NotificationPreference.muted = true` (`forever`, via the existing mute UI/endpoint) → User A sends a DM to B while B is offline → no push is delivered to B; the in-app `Notification` row is still created (mute stays push-only per open question #42).
3. User B sets `desktopEnabled: false` globally → DM to offline B → no push, in-app notification still created.
4. User B is `ONLINE` (has an active socket) → DM to B → no push (matches the existing online-suppression rule).
5. Temporarily unset `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` in the API's env → send a DM to an offline recipient with a saved subscription → the `POST .../messages` request still returns `201` with the message, a `warn` is logged, no push is attempted.
6. Force a push delivery error (e.g. stub/point a subscription's `endpoint` at an unreachable URL) → confirm the DM create request still succeeds and the failure is only logged, not surfaced to the client.
7. Group DM with 3 offline members, all with active subscriptions and no mute → all three receive a push.
8. Send a forward-only direct message (no text) → the push body renders the forward's content fallback, same as the in-app notification body today.

## Deployment notes

- New env vars: none — DM push reuses the existing `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` already required for channel push; no `.env.example` change needed.
- Migration: none.
- Cache/queue to clear: none.
- `overview.md` for this menu: this repo keeps flat `docs/features/<kebab>.md` files rather than a per-menu `overview.md` (confirmed by `ls docs/features/` — no `overview.md` exists anywhere in the folder, and `timed-notification-mute.md` follows the same flat convention); no overview file to update.
- Breaking API change: none — this is a new side effect on an existing endpoint, no request/response shape change.

## Deviations

Built 2026-09-25 against the approved spec. Differences from the text above:

1. **`title` and `body` are passed in, not rebuilt inside `PushService`.** The spec described both
   "takes `title`/`body` as input" and "builds the title from `{sender}` / the group name". The second
   reading would require `PushService` to know `conversation.isGroup` and the group's name, which its
   input does not carry. The implementation reuses whatever `directMessageNotificationTitle`
   (`direct-messages.service.ts:317`) already computed for the in-app `Notification.title`, so the push
   and the in-app row can never drift.
2. **Consequence: the two new i18n keys are passthrough templates** —
   `push.directMessage.title` is `'{title}'` and `.body` is `'{content}'`. They keep the catalog
   complete and the call site consistent with `push.channelMessage.*`, but they translate nothing
   today. Giving DM push a channel-style `"{author}: {content}"` body means widening
   `SendDirectMessagePushInput` with the conversation's shape; deliberately not done here.
3. **`fromUsername` was dropped from `SendDirectMessagePushInput`.** The agent added it, but nothing
   read it once the title was passed in; it was removed during review rather than left as a field with
   no reader.
4. **`data.url` is `/channels/@me/:conversationId`**, matching the existing channel-mention push
   (`push.service.ts:113`). Neither URL actually navigates today: the web app has no URL router beyond
   `/login`, and nothing in `apps/web/src` handles the `NAVIGATE` message `sw.js:36` posts. This is a
   pre-existing gap on the channel path too, left untouched here and worth its own task.
5. **No DM-specific throttle**, as Trade-offs option D chose. A chatty sender produces one push per
   message to an offline recipient.

**Verified**: `typecheck`, `lint`, `i18n:check`, `build` pass. Sending a DM still returns `2xx` and the
message is readable by the recipient with the push path wired in.

**Not verified**: an actual push delivery to a browser subscription (no VAPID subscription exists in
the local environment), the mute/`desktopEnabled` suppression branches, and the failure path where
`deliver` throws.
