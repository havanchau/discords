# Feature Spec: Scheduled Messages

Lets a member compose a channel or DM message now and have it sent automatically at a future time, with the ability to review, edit, or cancel it before it fires.

## Goal

A member picks "Schedule" instead of "Send" on the composer, chooses a future time, and the message is posted by the server at that time as if they had sent it then — with every permission check re-run at send time, not at schedule time.

Acceptance criteria:

- `POST /channels/:channelId/scheduled-messages` and `POST /direct-conversations/:conversationId/scheduled-messages` create a pending scheduled message for a time 1 minute to 30 days ahead.
- `GET .../scheduled-messages` lists the caller's own pending and failed scheduled messages for that destination; `PATCH /scheduled-messages/:id` edits content/time while still pending (or reschedules a failed one); `DELETE /scheduled-messages/:id` cancels it.
- At the scheduled time, the server re-runs the exact same checks a live send would run (view/send permission, timeout, slowmode, DM membership, DM block) and either posts the message or marks it failed with a reason — it never silently posts a message the author would no longer be allowed to send.
- A scheduled message that fails at send time is never retried automatically and is visible to its author as "failed" with the reason; the author also gets an inbox notification.
- Only the author can see, edit, or cancel their own scheduled messages; nobody else can list them.

## Scope

- **In scope**: scheduling a new message (with attachments) for a channel or a DM/group DM, listing/editing/cancelling the caller's own pending scheduled messages, rescheduling or dismissing a failed one, permission and moderation re-check at send time, realtime delivery of the sent message through the existing message pipeline, an inbox notification when a scheduled send fails.
- **Out of scope**: recurring/repeating schedules, scheduling a reply inside a thread, scheduling an edit to an existing message, a shared "scheduled messages" view across all destinations (each destination's own composer surfaces only its own list), retry-on-failure, scheduling voice recordings or slash commands, scheduling into an end-to-end encrypted channel (see Deviations).

## Current Behavior

- No scheduling concept exists anywhere in the codebase; grep for `schedule` across `apps/api/src` and `apps/web/src` returns no application matches.
- No job/queue library is installed: `apps/api/package.json` has no `@nestjs/schedule`, `bullmq`, or `node-cron` dependency. [server-events.md](server-events.md) hit the same gap and avoided it by computing status instead of scheduling a job — that option is not available here because a scheduled message needs an actual side effect (a post) at a real wall-clock time.
- [saved-messages.md](saved-messages.md) already delivers timed reminders with an in-process `setInterval` sweep and a conditional-claim `updateMany` (`apps/api/src/modules/saved-messages/reminder-sweep.service.ts:30-73`), safe across several API instances.
- Sending a message today goes through either the REST endpoint `POST /channels/:channelId/messages` (`messages.controller.ts:65`) or the socket event `message:create` (`messages.gateway.ts:46`); both call `MessagesService.createMessage`, which runs `requireCanPostInChannel`: `requireReadableChannel` → `SendMessages` → `requireNotTimedOut` → slowmode (`messages.service.ts:151-157`). DM sends go through `DirectMessagesService.createMessage`, checking conversation membership and the 1-1 block list (`direct-messages.service.ts:78-100`).
- `MessagesService.createMessage` does not broadcast; the socket gateway emits `message:created` and `unread:updated` after it (`messages.gateway.ts:72-77`), and `ForwardingService.deliver` does the same for a REST-driven send (`forwarding.service.ts:100-128`). `DirectMessagesService.createMessage` emits `dm:created` and unread counts itself.
- Slowmode enforcement (`enforceSlowmode`, `messages.service.ts:497-525`) and timeout enforcement (`PermissionsService.requireNotTimedOut`, `permissions.service.ts:63-71`) both key off the _current_ time and the _current_ member/channel state — exactly the state a scheduled send must re-read.

## Changes

### Rules

- `content` and `attachments` follow the same validation as `CreateMessageDto`/`CreateDirectMessageDto` (`create-message.dto.ts`, `create-direct-message.dto.ts`), with the DM attachment cap (10) applied to both destinations; `sendAt` must be 1 minute (5 s grace) to 30 days ahead of the request time. Content that is empty after trimming with no attachments is rejected at schedule time.
- At schedule time the caller must already be able to reach the destination: for a channel, `requireReadableChannel` plus `SendMessages`; for a DM, conversation membership. A `replyToMessageId` must exist in that destination. Timeout, slowmode and block are **not** checked at schedule time — only at send time.
- An author may hold at most 50 pending scheduled messages per destination (the list size); a 51st returns `400 Too many scheduled messages`.
- A pending scheduled message can be edited (`content`, `attachments`, `sendAt`) or cancelled only by its author. A failed one can be rescheduled with `PATCH` (the resulting `sendAt` must be valid again; the row returns to `PENDING` and its reason is cleared) or dismissed with `DELETE`. Any other state (`SENDING`, `SENT`), or another author's row, returns `404 Scheduled message not found`.
- `DELETE` removes the row; there is no `CANCELLED` state.
- At `sendAt`, the sweep claims the row and calls the destination's own send method with the author's id, so the full live-send check runs: for a channel, `requireReadableChannel` → `SendMessages` → `requireNotTimedOut` → slowmode, and the reply target; for a DM, conversation membership → block check. A failure at any of these sets `status = 'FAILED'` with a `failureReason` code and does **not** post anything.
- Slowmode interacts the same way a live send does: if the author's last message in that channel is inside the slowmode window at `sendAt`, the send fails (`SLOWMODE`) rather than being delayed — a scheduled message is not exempt from slowmode and does not queue-and-wait.
- A ban or kick between scheduling and `sendAt` fails the channel's `requireReadableChannel` step, producing `FAILED`; a DM block between the two parties fails the block check the same way. A deleted channel or conversation cascades and removes its scheduled rows.
- `failureReason` is a stable code, translated by the client: `NO_ACCESS`, `MISSING_PERMISSION`, `TIMED_OUT`, `SLOWMODE`, `BLOCKED`, `REPLY_TARGET_MISSING`, `REJECTED` (any other refusal of the send path, e.g. invalid attachment), `INTERRUPTED` (see Risks), `UNKNOWN` (unexpected server error, logged).
- On `FAILED` the author receives an inbox notification of type `SCHEDULED_MESSAGE_FAILED` in their stored locale. On `SENT` and `FAILED` the author's sockets receive `scheduled-message:updated` so an open list refreshes.
- No audit log entry for a channel scheduled message succeeding (it is indistinguishable from a normal send once posted); a `FAILED` scheduled message is not audited either.

### Client

- The channel and DM composers get a "Schedule message" icon button next to send, opening a `PopoverRoot`/`PopoverContent` with a `datetime-local` field in the user's local time zone, converted to UTC on submit (the `ReminderPicker` helpers from saved messages). It schedules the current draft, reply target and selected files (uploaded first, like a send), then clears the composer.
- Each composer shows a "Scheduled (n)" button once the destination has any pending or failed scheduled message; it opens a dialog listing them with Edit and Cancel actions, and a separate "Failed" section showing the translated reason with Reschedule and Dismiss. Loading, empty, and error states follow the `ServerEventsDialog` pattern (`components/events/ServerEventsDialog.tsx`).
- Scheduling is disabled for a draft that is a slash command (the command would be posted as literal text) and not offered in a channel with end-to-end encryption active.
- A sent scheduled message appears exactly like a normal message through the existing `message:created`/`dm:created` events — the client does not special-case its rendering once posted.

## Technical Approach

### Data model

```prisma
enum ScheduledMessageStatus {
  PENDING
  SENDING
  SENT
  FAILED
}

model ScheduledMessage {
  id               String                 @id @default(cuid())
  authorId         String
  channelId        String?
  conversationId   String?
  content          String
  attachments      Json?                  // MessageAttachmentInputDto[], re-validated by the send path
  replyToMessageId String?
  sendAt           DateTime
  status           ScheduledMessageStatus @default(PENDING)
  failureReason    String?
  sentMessageId    String?
  claimedAt        DateTime?
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt
  author           User                   @relation(fields: [authorId], references: [id], onDelete: Cascade)
  channel          Channel?               @relation(fields: [channelId], references: [id], onDelete: Cascade)
  conversation     DirectConversation?    @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([status, sendAt])
  @@index([authorId, channelId, status])
  @@index([authorId, conversationId, status])
}
```

`attachments` stores the same validated shape `MessageAttachmentInputDto` defines, read back through a narrowing parser, so the send-time path feeds it straight into `createMessage`. Migration `20260917004000_add_scheduled_messages`.

### API

| Method   | Path                                                       | Body                                                   | Response                                              | Rate limit |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | ---------- |
| `POST`   | `/channels/:channelId/scheduled-messages`                  | `{ content, attachments?, replyToMessageId?, sendAt }` | `201 { scheduledMessage }`                            | 10/min     |
| `POST`   | `/direct-conversations/:conversationId/scheduled-messages` | same                                                   | `201 { scheduledMessage }`                            | 10/min     |
| `GET`    | `/channels/:channelId/scheduled-messages`                  | —                                                      | `{ scheduledMessages: [...] }` (caller's own, max 50) | default    |
| `GET`    | `/direct-conversations/:conversationId/scheduled-messages` | —                                                      | same                                                  | default    |
| `PATCH`  | `/scheduled-messages/:id`                                  | `{ content?, attachments?, sendAt? }`                  | `{ scheduledMessage }`                                | 20/min     |
| `DELETE` | `/scheduled-messages/:id`                                  | —                                                      | `{ ok: true }`                                        | 20/min     |

`GET` returns `PENDING` and `FAILED` rows (not `SENDING`/`SENT`), ordered by `sendAt`. Listing re-checks that the caller can still read the channel or is still in the conversation.

### Realtime

- `scheduled-message:updated` → author's user room, payload `{ scheduledMessageId, channelId, conversationId, status }`, on `SENT` and `FAILED`.
- A sent channel message emits `message:created` and `unread:updated` exactly like `ForwardingService.deliver`; a DM emits through `DirectMessagesService.createMessage` itself.

### Scheduling mechanism

- `ScheduledMessageSweepService` follows `ReminderSweepService`: a `setInterval` started in `onApplicationBootstrap` (un-refed, cleared in `onModuleDestroy`) every 15 s, with an overlap guard. Each tick reads up to 50 due ids (`status = 'PENDING' AND sendAt <= now`) and claims each with `updateMany({ where: { id, status: 'PENDING', sendAt <= now }, data: { status: 'SENDING', claimedAt: now } })`; a `count` of 0 means another instance, an edit, or a cancel won.
- For each claimed row the sweep calls `MessagesService.createMessage`/`DirectMessagesService.createMessage`, then writes `SENT` + `sentMessageId`; an `HttpException` maps to a `failureReason` code and `FAILED`. Both writes are conditional on `status = 'SENDING'`.
- Each tick first marks rows stuck in `SENDING` with `claimedAt` older than 2 minutes as `FAILED` / `INTERRUPTED` (see Risks).
- Edits and cancels are conditional on `status IN (PENDING, FAILED)`, so they cannot overwrite a claim in progress.

### Files

- API: `modules/scheduled-messages/` — `scheduled-messages.module.ts`, `scheduled-messages.controller.ts`, `scheduled-messages.service.ts` (CRUD), `scheduled-message-sweep.service.ts` (the interval and delivery), `scheduled-message.rules.ts` (timing constants, `validateSendAt`, stored-attachment parser, failure-reason mapping), `dto/create-scheduled-message.dto.ts`, `dto/update-scheduled-message.dto.ts`; `app.module.ts`; `prisma/schema.prisma` and the migration; `common/i18n/error-codes.ts` and both API locale catalogs (new error literals, `scheduledMessage.failed.*` notification copy).
- Shared: `api-contract.ts` (`ScheduledMessageView`, inputs, status/reason unions, `ScheduledMessageUpdatedPayload`), `realtime-events.ts` (`ScheduledMessageUpdated`).
- Web: `api.ts` (type re-exports), `query/queryKeys.ts`, `hooks/useScheduledMessages.ts`, `components/chat/ScheduleSendButton.tsx` (the popover), `components/chat/SendAtField.tsx`, `components/chat/ScheduledMessagesBar.tsx` (the "Scheduled (n)" row), `components/chat/ScheduledMessagesDialog.tsx`, `components/chat/ScheduledMessageItem.tsx`, `components/chat/ScheduledMessages.module.css`, `components/chat/MessageComposer.tsx` (+ `.module.css`, one more grid column), `components/chat/types.ts`, `components/ChatPanel.tsx`, `AppShell.tsx` (one `clearAfterSchedule` entry on the composer object), `components/home/DirectMessageComposer.tsx`, `components/home/HomePanel.module.css` (composer grid), `i18n/locales/en.ts` and `vi.ts` (`scheduled.*` keys, `error.fallback.*` keys).

### Deviations from the reviewed draft

- **No `@nestjs/schedule`**: the sweep reuses the `setInterval` + conditional-claim pattern from `reminder-sweep.service.ts` instead of adding a dependency (decision by the implementation lead; open question 11 is answered by the same polling approach without the library).
- **`status` is a Prisma enum** (`ScheduledMessageStatus`), like `SavedMessageSourceType`, instead of a free `String`; `claimedAt` is added for stuck-claim recovery.
- **No `CANCELLED` status**: `DELETE` removes the row, so cancelled drafts do not accumulate.
- **Failed rows can be rescheduled and dismissed**: the draft said editing or cancelling a `FAILED` row returns `404`, but its Trade-offs said the author retries by editing `sendAt`. The Trade-offs reading is kept; `SENDING`/`SENT` still return `404`.
- **Stuck `SENDING` rows fail as `INTERRUPTED` instead of being re-claimed**: re-claiming could double-post when the process died after the post but before writing `SENT`.
- **`failureReason` stores a code, not the exception message**: exception messages are English literals, and the reason must render in the author's locale.
- **Author notification on failure** (inbox notification + realtime refresh), which the draft only described as "visible to its author".
- **Attachment cap and pending cap**: 10 attachments for both destinations, 50 pending per author per destination (the draft listed 50 as the list size only).
- **Not offered in encrypted channels, not for slash commands**: the server would post plaintext into an E2EE channel, and a command would be posted as literal text.
- **Migration name** `20260917004000_add_scheduled_messages` instead of `20260917030000_…`, to sit directly after `20260917003000_add_voice_messages`.
- **DM routes under `/direct-conversations/:conversationId/…`** instead of `/conversations/…`, matching the existing DM controller prefix (`@Controller('direct-conversations')`, `direct-messages.controller.ts:24`).
- **DM composer grid**: `HomePanel.module.css` `.composer` gains explicit columns for the voice button (added by `voice-messages.md` without a column, which pushed the send button onto a second row) and the schedule button.

## Trade-offs

- **In-process `setInterval` sweep vs. `@nestjs/schedule` vs. BullMQ on the existing Redis**: BullMQ would give exact-time delivery and horizontal scaling, but it is a new operational concept (a queue, a worker, retry/backoff semantics) in a repo that runs everything in-process and has explicitly avoided job infrastructure ([server-events.md](server-events.md) Trade-offs). `@nestjs/schedule` would only wrap the same `setInterval` in a decorator at the cost of a new dependency; `ReminderSweepService` already proves the plain timer + conditional claim works across instances, and one pattern for both sweeps is easier to maintain. A 15-second poll is within the tolerance a "send at 3pm" feature needs. If sends need second-level precision, BullMQ is the natural upgrade.
- **Conditional claim (`UPDATE ... WHERE status = 'PENDING'`) vs. `SELECT ... FOR UPDATE` in a transaction**: the conditional update is simpler to reason about across polling instances and does not hold a transaction open across the permission checks and `createMessage` calls that follow.
- **Calling the existing send methods vs. re-implementing the checks in the sweep**: reusing `createMessage` guarantees the checks cannot drift from a live send (same approach as `forwarding.service.ts`); the cost is that failure reasons are recovered from exception messages, mapped in one function.
- **Re-running full live-send checks vs. trusting the checks made at schedule time**: the acceptance criteria require this; the cost is that a scheduled message can fail between creation and `sendAt` for reasons outside the author's control (a ban, a new block, a slowmode change) — surfaced to the author as `FAILED` rather than hidden.
- **No automatic retry on failure**: retrying a slowmode/timeout failure blindly risks spamming an intentional moderation action or double-posting; leaving retry to the author (reschedule) is simpler and safer.
- **Fail stuck claims vs. re-claim them**: failing loses a message that may not have been posted; re-claiming may post it twice. The author can reschedule a failed one, but cannot un-post a duplicate.

## Risks & Rollback

- **Risk**: the poll interval means a scheduled message can post up to ~15 seconds late, plus the duration of a slow tick.
- **Risk**: if the API stops mid-send (row is `SENDING`), the next tick on any instance after 2 minutes marks it `FAILED` / `INTERRUPTED`. If the post had already been written, the author sees a failure for a message that was actually sent.
- **Risk**: attachment URLs are stored at schedule time; an upload file removed before `sendAt` would post a broken link (no file cleanup exists today, per `forward-message.md` Risks).
- **Risk**: `SENT` rows are kept (with `sentMessageId`) and never cleaned up; volume is bounded by the 10/min rate limit and the pending cap.
- **Risk**: each API instance must have its Socket.IO server attached for the sweep's realtime emits to reach clients, the same assumption `ReminderSweepService` and `NotificationsService` make.
- **Rollback**: revert code; the migration is additive (new enum, new table). Reverting it drops pending scheduled messages.

## Test Plan

No automated test suite in this repo (`RULE.md:77`); verified with `npm run typecheck`, `npm run lint`, `npm run build`, plus the manual scenario below.

- **Manual — happy path**: member schedules a message for 1 minute ahead in a channel → "Scheduled (1)" appears, the dialog lists it as pending → after ~1 minute it posts as a normal message visible to everyone, unread badges update, and it disappears from the list.
- **Manual — DM with attachment**: schedule a DM with an image for 2 minutes ahead → the recipient receives it at that time with the image.
- **Manual — edit / cancel**: edit the content and time of a pending message → the new content posts at the new time; cancel another → it never posts.
- **Manual — permission re-check**: member schedules a message, is then timed out before `sendAt` → at `sendAt` it becomes `FAILED` with the timeout reason, an inbox notification arrives, and nothing is posted. Reschedule it after the timeout ends → it posts.
- **Manual — block**: schedule a 1-1 DM, the recipient blocks the author → `FAILED` with the blocked reason.
- **Failure case**: member A calls `PATCH /scheduled-messages/:id` on member B's scheduled message → `404`; `POST` with `sendAt` 10 seconds ahead → `400 Scheduled time must be between 1 minute and 30 days from now`.

## Deployment Notes

- Run migration `20260917004000_add_scheduled_messages` before deploying the API.
- No new dependency and no new env variable.
- New `scheduled.*` web keys and `scheduledMessage.failed.*` / error-code API keys ship in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
