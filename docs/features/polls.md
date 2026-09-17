# Feature Spec: Polls

Replaces the text-only `/poll` shortcut with a real poll message: options, votes, live counts, and an expiry.

## Goal

A member creates a poll with 2–10 options from the composer; other members vote, counts update live, and the poll closes automatically at its expiry or when the creator ends it.

Acceptance criteria:

- `/poll Question | Option A | Option B` creates a persisted poll message instead of formatted text, in a channel or a DM.
- `POST /channels/:channelId/polls` and `POST /conversations/:conversationId/polls` create a poll; `PUT /polls/:pollId/votes` casts or changes a vote; `POST /polls/:pollId/close` ends it early; `GET /polls/:pollId` reads it (voter names on demand).
- Vote counts and percentages are visible to everyone who can read the message as soon as the first vote is cast; the poll never reveals _who_ voted unless the creator chose "show voters" at creation time.
- A closed or expired poll rejects new votes with `403`.
- Open clients see vote and close updates without a refetch.

## Scope

- **In scope**: poll message type for channels and DMs, single- and multi-choice voting, an optional expiry, live counts, an optional per-poll "show voters" toggle set at creation, closing early by the creator.
- **Out of scope**: editing options after creation, anonymous-but-auditable votes (export for moderators), poll templates, scheduling a poll for later (see [scheduled-messages.md](scheduled-messages.md)), reopening a closed poll.

## Current Behavior

- `/poll` is parsed client-side only: `parseSlashCommand` in `apps/web/src/utils/slashCommands.ts:11-18` registers it as `owner: 'client'`, and `executeSlashCommand` in `apps/web/src/utils/executeSlashCommand.ts:49-59` turns `Question | A | B` into a single Markdown-formatted string (`📊 Question\n1. A\n2. B`) that is sent as ordinary message `content` — there is no vote, no count, and no server concept of a poll.
- `Message` has no poll relation (`apps/api/prisma/schema.prisma:353-375`); `DirectMessage` has none either (`:579-596`) and today never carries attachments or structured payloads at all — `CreateDirectMessageDto` only has `content` and `replyToMessageId` (`apps/api/src/modules/direct-messages/dto/create-direct-message.dto.ts`).
- Channel message creation (`MessagesService.createMessage`, `apps/api/src/modules/messages/messages.service.ts:163-254`) checks `ViewChannel`/`SendMessages`, `requireNotTimedOut`, and slowmode before persisting; DM creation (`DirectMessagesService.createMessage`, `apps/api/src/modules/direct-messages/direct-messages.service.ts:69-130`) checks conversation membership and the 1-1 block list (`findBlockBetween`, `apps/api/src/modules/friends/user-blocks.ts:4-14`) — any new write path must repeat the same checks, there is no shared "can post in this destination" helper today.
- Realtime for channel messages goes to `channelRoom(channelId)` as `message:created`/`message:updated`/`message:deleted` (`realtime-publisher.service.ts:56`, used at `messages.service.ts:397-434`); DM messages go to `conversationRoom` plus each recipient's `userRoom` as `dm:created` (`direct-messages.service.ts:108-115`).

## Changes

### Rules

- `question` 1–300 characters after trimming; 2–10 `options`, each 1–80 characters, no duplicates after trimming (compared case-insensitively).
- `allowMultiple` (bool, default `false`) and `expiresAt` (optional, 5 minutes to 7 days ahead, with one minute of grace on the lower bound for request latency) are set at creation and are immutable afterward.
- The poll message's `content` is the question, so conversation previews, search, reply previews and notifications read naturally; the question is immutable, so the API refuses to edit a poll message with `403 Poll messages cannot be edited` (channel and DM). Deleting it is allowed and hides the poll.
- `showVoters` (bool, default `false`) is set at creation and is immutable; when `false` the API never includes a voter's identity in any response or event, only aggregate counts.
- Voting requires the same read access as the message itself (channel `ViewChannel`, or DM conversation membership) — the same checks `createMessage` already runs, not a new permission. A timed-out channel member cannot vote, matching reactions (`requireNotTimedOut`).
- Creating a channel poll runs every gate a new top-level message passes — `ViewChannel`, `SendMessages`, timeout, slowmode — through `MessagesService.requireCanPostInChannel`, which `createMessage` now also calls. Creating a DM poll checks membership and the 1-1 block list like `DirectMessagesService.createMessage`.
- A member may vote once per poll; voting again replaces the previous choice(s) (single-choice: swap; multi-choice: replaces the full selection set), so `votedOptionIds` in the response always reflects the caller's current vote.
- Closing is allowed only by the poll's creator or a member holding `MANAGE_MESSAGES` on the channel (DM polls: creator only, since DMs have no moderation roles) and is irreversible.
- An expired poll behaves as closed for voting purposes even before any cron/poll runs — closing is a computed status (`now >= expiresAt || closedAt != null`), like `ServerEvent` status in [server-events.md](server-events.md), so no scheduler is required to enforce it.
- Audit: channel polls only (DMs have no audit log) — `POLL_CREATE` `{ pollId, question }`, `POLL_CLOSE` `{ pollId }`.

### Client

- `/poll` becomes `owner: 'server'` in `SLASH_COMMANDS`; `executeSlashCommand`'s `'poll'` branch (`executeSlashCommand.ts:49-59`) is replaced with a call to the new create-poll endpoint instead of formatting text, matching how `/nick` and `/invite` already call the API (`executeSlashCommand.ts:65-84`).
- Syntax: `/poll Question | Option A | Option B`, plus optional segments `--multiple`, `--show-voters`, and `--expires=<number><m|h|d>` (for example `| --expires=12h`). An unknown `--` segment or fewer than two options shows a translated usage error and sends nothing.
- The DM composer runs `/poll` the same way (`useDirectMessages.sendDirectMessage`); every other slash-looking DM text is still sent as typed.
- A poll message renders as a card (`PollCard`, shared by `MessageRow` and `DirectMessageRow`): question, each option as a row with a proportional bar and count/percentage, a select control (native radio for single-choice — the UI kit has no radio primitive — and `Checkbox` for multi-choice), an expiry label, a "Voters" popover when `showVoters` is on, and a "Close poll" action for whoever is allowed to close it. In multi-choice the last selected option cannot be unchecked, since votes are replaced, never removed.
- "Close poll" shows for the creator, and in channels also for members with server-level `MANAGE_MESSAGES` (`memberHasServerPermission`); the API applies channel overrides and is the authority.
- Voting is optimistic (the pending selection is rendered from the vote mutation's variables), reconciled by the `PUT` response for the voter and by `poll:updated` counts for everyone else.

## Technical Approach

### Data model

```prisma
model Poll {
  id             String    @id @default(cuid())
  messageId      String?   @unique
  directMessageId String?  @unique
  creatorId      String
  question       String
  allowMultiple  Boolean   @default(false)
  showVoters     Boolean   @default(false)
  expiresAt      DateTime?
  closedAt       DateTime?
  createdAt      DateTime  @default(now())
  message        Message?       @relation(fields: [messageId], references: [id], onDelete: Cascade)
  directMessage  DirectMessage? @relation(fields: [directMessageId], references: [id], onDelete: Cascade)
  creator        User           @relation(fields: [creatorId], references: [id])
  options        PollOption[]

  @@index([expiresAt])
}

model PollOption {
  id       String @id @default(cuid())
  pollId   String
  label    String
  position Int
  poll     Poll         @relation(fields: [pollId], references: [id], onDelete: Cascade)
  votes    PollVote[]

  @@index([pollId])
}

model PollVote {
  pollId    String
  optionId  String
  userId    String
  createdAt DateTime @default(now())
  poll      Poll       @relation(fields: [pollId], references: [id], onDelete: Cascade)
  option    PollOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([pollId, optionId, userId])
  @@index([pollId, userId])
}
```

`Message` and `DirectMessage` each gain an optional `poll Poll?` back-relation; `Poll` also carries `votes PollVote[]` and `User` gains `createdPolls Poll[]` and `pollVotes PollVote[]`, the back-relations Prisma requires (no extra columns). `DirectMessage` gaining any structured child row is new — today it has none (`schema.prisma:579-596`); this is the minimal addition needed rather than adding a general DM-attachment mechanism (see Trade-offs).

Migration `20260917000000_add_polls`.

### API

| Method | Path                                   | Body                                                                       | Response                          | Rate limit |
| ------ | -------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | ---------- |
| `POST` | `/channels/:channelId/polls`           | `{ question, options: string[], allowMultiple?, showVoters?, expiresAt? }` | `201 { message }` (poll embedded) | 10/min     |
| `POST` | `/conversations/:conversationId/polls` | same                                                                       | `201 { message }`                 | 10/min     |
| `PUT`  | `/polls/:pollId/votes`                 | `{ optionIds: string[] }`                                                  | `{ poll }`                        | 60/min     |
| `POST` | `/polls/:pollId/close`                 | —                                                                          | `{ poll }`                        | 20/min     |
| `GET`  | `/polls/:pollId`                       | —                                                                          | `{ poll }`                        | global     |

`PollView`: `{ id, question, allowMultiple, showVoters, expiresAt, closedAt, status: 'OPEN' | 'CLOSED', options: Array<{ id, label, voteCount, voters?: Array<{ id, displayName, avatarUrl }> }>, votedOptionIds: string[] }`. `voters` is present only when `showVoters` is `true`. `Message.poll` and `DirectMessage.poll` carry it (`null` for ordinary and deleted messages); reply previews always carry `poll: null`.

`votedOptionIds` is the requesting user's selection only in responses read by that user (message lists, `GET`/`PUT`/close). Any payload broadcast to a room — `message:created`, `reaction:updated`, `thread:message:created`, `dm:*` — carries an empty array, so one user's vote never reaches others when `showVoters` is off; clients keep the selection they already hold when such a payload replaces a message (`keepViewerPollState`).

Status codes: `400` validation (bad expiry, duplicate options, wrong option count for single-choice, unknown option id), `403` closed poll, no channel access, timed out, or not allowed to close, `404` unknown poll, deleted poll message, or not a conversation member.

### Realtime

- `poll:updated` `{ pollId, channelId, conversationId, status, closedAt, options: Array<{ id, voteCount }> }` — no voter identity even when `showVoters` is true; clients refetch voter names lazily through `GET /polls/:pollId` when the "Voters" popover is open, to avoid pushing identity data to everyone on every vote. `channelId`/`conversationId` tell the client which message list to patch.
- Creating a poll emits `message:created` (channel) or `dm:created` (DM) with the formatted message, since polls are created over REST rather than the `message:create` socket command.
- Channel polls emit to `channelRoom(channelId)`; DM polls emit to `conversationRoom(conversationId)` plus each recipient's `userRoom`, mirroring `dm:created` (`direct-messages.service.ts:108-115`).

### Files

- Shared: `packages/shared/src/api-contract.ts` (`PollView`, `PollOptionView`, `CreatePollInput`, `PollUpdatedPayload`, `Message.poll`, `DirectMessage.poll`), `realtime-events.ts` (`PollUpdated`).
- API: `modules/polls/polls.module.ts`, `polls.controller.ts`, `polls.service.ts`, `poll-status.ts`, `poll.format.ts` (include, formatting, broadcast stripping), `dto/create-poll.dto.ts`, `dto/vote-poll.dto.ts`, `messages.service.ts` (embed poll in message formatting, `requireCanPostInChannel`, refuse editing poll messages), `realtime/messages.gateway.ts` (strip viewer vote from `reaction:updated`), `direct-message.format.ts` (embed poll), `direct-messages.service.ts` (viewer id for lists), `direct-message-actions.service.ts` (refuse editing poll messages), `common/i18n/error-codes.ts` and API `locales/en.ts`/`vi.ts` (new error literals), `app.module.ts`.
- Web: `api.ts` (`Poll`, `PollOption`, `CreatePollInput`, `PollUpdatedPayload` types), `utils/polls.ts` (command parsing, count merging), `utils/executeSlashCommand.ts` (poll branch calls the API), `utils/slashCommands.ts` (`owner: 'server'`), `hooks/usePollVoting.ts`, `components/chat/PollCard.tsx` + `.module.css`, `components/chat/MessageRow.tsx` and `types.ts`, `hooks/useChannelMessageActions.ts` (`updatePoll`, `canManageMessages`), `AppShell.tsx`, `hooks/useRealtimeSocket.ts` (`poll:updated`), `hooks/useDirectMessages.ts` (DM `/poll`), `components/home/DirectMessageRow.tsx`, `HomeDirectMessageView.tsx`, `types.ts`, `hooks/useDirectMessageActions.ts`, `hooks/useHomeWorkspace.ts`, `utils/directMessages.ts`, `query/queryKeys.ts` (`poll`), `i18n/locales/en.ts` and `vi.ts` (`poll.*` keys; the retired `slash.poll.default` key is removed).

## Trade-offs

- **Dedicated `Poll`/`PollOption`/`PollVote` tables vs. a JSON blob on the message**: normalized tables let `PUT .../votes` do a single upsert and keep `@@id([pollId, optionId, userId])` as the natural one-vote-per-option guard; a JSON blob would need read-modify-write with a race on every vote. Cost: three new tables instead of one JSON column.
- **DM polls now vs. channel-only**: the task explicitly asks for a channel + DM decision. DMs today have zero structured-content support (no attachments, no polls) — adding `directMessageId` to `Poll` is a small, additive step; building a general DM-attachment pipeline just to support polls would be much larger and out of scope. Chosen: support DM polls narrowly through this one relation, and land DM attachments as their own feature later if needed.
- **Computed `OPEN`/`CLOSED` status vs. a scheduler that flips `closedAt` at expiry**: same reasoning as `ServerEvent` in [server-events.md](server-events.md) — no job runner exists in this repo yet, and a computed status is always correct without one. Cost: an expired-but-not-yet-closed poll still accepts a vote request until the status check rejects it at the API boundary (never stores it, so no inconsistency reaches the client).
- **Voter identity hidden by default vs. always shown**: matches the product expectation that polls are opinion tools, not audits; `showVoters` is opt-in per poll and immutable so a creator cannot retroactively deanonymize votes already cast anonymously.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- Migration is `20260917000000_add_polls`, not `20260917010000_add_polls`, as assigned for this implementation.
- `GET /polls/:pollId` was added: realtime updates carry counts only, and the "refetch voter names lazily" rule needs an endpoint to refetch from.
- `poll:updated` also carries `channelId`, `conversationId` and `closedAt`, and its options omit `label`, so clients can patch the right list without a lookup.
- Broadcast payloads carry an empty `votedOptionIds` (see API); without that, `reaction:updated` and thread events would have leaked the acting user's vote.
- Poll messages cannot be edited, and voting refuses timed-out members; both follow from existing rules (immutable question, timeout gates reactions) but were not written down.
- `/poll` gained the `--multiple`, `--show-voters` and `--expires=` segments, since the manual DM scenario needs `showVoters` and the spec gave the composer no other way to set it.
- Revoking a vote is not offered (open question 8 in [open-questions.md](open-questions.md): voting again replaces the vote; no remove action).
- **Delivery (2026-09-17):** a channel poll emits `unread:updated` to unread recipients after `message:created`; a direct poll goes through `DirectMessagesService.announceCreatedMessage` (author read state, `dm:created`, `dm:unread`, `DIRECT_MESSAGE` notification). `/poll` is refused by the web client in a channel it encrypts. See [wave-3-2-follow-ups.md](./wave-3-2-follow-ups.md).

## Risks & Rollback

- **Risk**: a member who already voted and then loses read access to the channel (role change, channel made private) keeps their `PollVote` row; the vote is not retracted, matching how existing reactions and pins are not retracted on access loss.
- **Risk**: replacing a vote deletes the old `PollVote` row(s) and inserts new ones in a transaction; a client retry on a flaky connection must be idempotent on `(pollId, userId)`, not on request id, since there is no dedicated idempotency key in this API today. The transaction locks the poll row (`SELECT ... FOR UPDATE`), so two concurrent requests from one user cannot leave the union of both selections, and a vote cannot land after a concurrent close. Cost: votes on one poll are serialized.
- **Limitation**: polls are created over REST, so creating one does not bump channel unread badges live (`unread:updated` is emitted only by the `message:create` socket path), and a DM poll does not send the DM notification or `dm:unread`. Badges and unread counts are correct after the next refetch. Mention push notifications are not sent for a poll question.
- **Risk**: in an E2EE channel the poll question and options are stored in plaintext; the client does not block `/poll` there.
- **Rollback**: revert code; the migration is additive (new tables, nullable back-relations).

## Test Plan

No automated test suite in this repo (`RULE.md:77`); verified with `npm run typecheck`, `npm run lint`, `npm run build`, plus the manual scenario below.

- **Manual — channel**: member A runs `/poll Best editor? | Vim | Emacs | VS Code` in a channel → a poll card appears for all viewers → member B votes "VS Code" → count updates live for A without reload → A closes the poll → B's vote button becomes disabled with a "closed" state.
- **Manual — DM**: member A creates a poll in a 1-1 DM with `showVoters: true` → B votes → A sees B's name next to the option.
- **Failure case**: member C, who cannot view the channel, calls `PUT /polls/:pollId/votes` directly → `403`.

## Deployment Notes

- Run migration `20260917000000_add_polls` before deploying the API.
- New `poll.*` i18n keys ship in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
