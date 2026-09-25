# Feature Spec: Decision Channels

A `DECISION` channel type whose top-level posts are proposals with a status lifecycle (`PROPOSED` →
`ACCEPTED` / `REJECTED`, with `ACCEPTED` → `SUPERSEDED` later), voted on through the existing poll
mechanism, resolved automatically at a deadline, and listed in a server-wide index of closed
decisions — organizational memory for "what did we decide, and when."

**Status**: draft — awaiting review

## Goal

Teams that use channels for decisions today bury them in ordinary chat: no one can tell whether a
proposal passed, when, or what replaced it later. A `DECISION` channel makes each top-level post a
structured proposal — vote, deadline, and a final status — and a server-wide index answers "what has
this server decided" without scrolling through message history.

Acceptance criteria:

- `POST /channels/:channelId/decisions` on a `DECISION` channel creates a proposal (a `Thread` rooted
  at a new `Message`, exactly as a forum post is created) with a title, body, an Accept/Reject poll,
  and a voting deadline.
- The proposal starts `PROPOSED`; it resolves to `ACCEPTED` or `REJECTED` — automatically at its
  deadline, or earlier by a moderator — and a state transition is only ever applied by a conditional
  `UPDATE ... WHERE status = 'PROPOSED'` (or `'ACCEPTED'` for supersession), never by a read-then-`if`.
- `GET /servers/:serverId/decisions` returns every decision in the server (across all of its
  `DECISION` channels) that has left `PROPOSED`, filterable by `status` and a date range — the index.
- Voting reuses the existing `Poll`/`PollOption`/`PollVote` tables and `PollsService` machinery
  unchanged; no new vote-counting code is written.
- Only a member holding `MANAGE_MESSAGES` on the channel can resolve a proposal early or mark an
  `ACCEPTED` decision as superseded by a newer one; a member without it gets `403`.
- A caller who tries an invalid transition (e.g. resolving an already-`REJECTED` proposal) gets `409`,
  not a silent no-op and not a `500`.

## Scope

**In scope**

- New `ChannelType` value `DECISION`; channel creation, sidebar icon, and the same
  view/send/timeout/slowmode gates `TEXT` already has for ordinary channel messages and replies.
- Proposal creation as a titled `Thread` (reusing the forum post shape), with a body, an embedded
  Accept/Reject poll, and a required voting deadline.
- Automatic resolution at the deadline via a `setInterval` sweep, following the existing
  `ReminderSweepService` / `ScheduledMessageSweepService` pattern — no new job-queue dependency.
- Manual early resolution and supersession by a `MANAGE_MESSAGES` holder on the channel.
- A minimal, additive quorum check (`Decision.quorumCount`) — a count threshold, not weighted voting.
  Below quorum at the deadline, the proposal stays `PROPOSED` (marked `expiredAt`) for manual
  resolution rather than auto-resolving — decided, see Voting → Quorum.
- A server-wide decision index endpoint and a minimal list view, filterable by status/date.
- Migration adding the `DECISION` enum value and the new `Decision` table.

**Out of scope** (spell it out, so it does not read as an oversight)

- A separate "discussing" status between `PROPOSED` and resolution. Replies inside the proposal's
  thread already carry discussion; adding a status value for it would gate nothing new. If the user
  wants a visible "under discussion" label later, it is a UI-only badge on `PROPOSED`, not a new enum
  value — flagged as a cut, not an oversight.
- **Weighted or role-based voting — closed, will not be built in v1** (`open-questions.md` #63,
  closed 2026-09-25). `PollVote` is one row per `(pollId, optionId, userId)`
  (`apps/api/prisma/models/messages.prisma:31-41`) with no weight column — every vote counts as one,
  same as every other poll in this repo. `Decision.quorumCount` (a participation threshold) is the
  only vote-related addition this doc makes. No schema column for a future weight is sketched or
  reserved anywhere in this doc — YAGNI: there is no consumer for it today, and a nullable column with
  no reader is exactly the "half-built design" the review asked to avoid. If role-weighted voting
  becomes a real requirement, it is a new task doc with its own schema and tally design.
- Editing a proposal's title, body, or deadline after creation (matches the forum post precedent:
  "editing a post's title/tags after creation is out of scope", `forum-channels.md` → Changes).
- Re-opening a resolved (`ACCEPTED`/`REJECTED`) proposal, or un-superseding a `SUPERSEDED` one.
- `PROPOSED` → `SUPERSEDED` directly. Supersession only replaces something that was actually decided
  (`ACCEPTED`); a proposal that never passed has nothing to supersede.
- Attachments/stickers on a proposal beyond what the reused thread-message send path already allows
  (no decision-specific attachment rule).
- Excluding decisions from message search, or building a decision-specific search — see Changes →
  Search below for why this needs no new code.
- Deleting a decision channel's proposals in bulk, moderation tooling beyond `MANAGE_MESSAGES`.
- A dedicated `DecisionsService` REST surface for editing quorum after creation.

## Current behavior

- `ChannelType` is `TEXT | VOICE | FORUM | STAGE | ANNOUNCEMENT`
  (`apps/api/prisma/models/channels.prisma:1-6`). Adding `DECISION` is this repo's fourth channel-type
  addition; `forum-channels.md`, `stage-channels.md`, and `announcement-channels.md` are its
  precedent, and this doc follows the same path (new enum value, DTO `@IsIn`, a service-level type
  gate, a sidebar icon branch) rather than inventing a different mechanism.
- `CreateChannelDto.type` is validated with
  `@IsIn(['TEXT', 'VOICE', 'FORUM', 'STAGE', 'ANNOUNCEMENT'])`
  (`apps/api/src/modules/channels/dto/create-channel.dto.ts:9-11`).
  `ChannelsService.createChannel` (`apps/api/src/modules/channels/channels.service.ts:25-50`) requires
  `ManageChannels` on the server, defaults `type` to `TEXT`, and only branches on `type === 'FORUM'`
  for `postGuidelines`.
- `MessagesService.requireCanPostInChannel` (`apps/api/src/modules/messages/messages.service.ts:173-184`)
  refuses a top-level send on `FORUM` (`400 Use forum posts on a FORUM channel`) and `STAGE`
  (`400 Stage channels have no text chat`); every other type falls through to `passSendGates`
  (`:192-197`), which checks `SendMessages`, timeout, and slowmode. `requireCanPostInForum`
  (`:186-190`) is the forum-specific variant, gated through
  `ChannelsService.requireReadableForumChannel` (`channels.service.ts:192-197`), which itself wraps
  `requireReadableChannel` (`:182-189`, `ViewChannel` + age confirmation) with a
  `400 Channel is not a forum channel` type check. A `DECISION` channel needs the same two-layer
  shape: a `requireReadableDecisionChannel` and a `requireCanPostInDecision`.
- `Thread` already models "root message + replies" (`apps/api/prisma/models/messages.prisma:101-120`):
  `Thread.rootMessageId String @unique` (`:105`) points at its root `Message`; `Thread.title String?`
  (`:108`, added by the forum-channels migration) is the nullable post title reused here — a decision
  proposal reuses `Thread` as its post shape and reuses `Thread.title` as the proposal title, no new
  title column needed. `Thread.channel` carries `onDelete: Cascade` to `Channel` (`:111`) and
  `Thread.rootMessage` carries `onDelete: Cascade` to `Message` (`:112`) — confirmed by reading the
  model directly (not inferred): deleting a `Channel` cascades to every `Thread` row in it directly via
  `:111`, and deleting a `Thread`'s root `Message` (itself cascaded from `Channel` via
  `Message.channel`'s own `onDelete: Cascade`, `:69`) cascades to the `Thread` via `:112` — either path
  ends with the `Thread` row gone. A `Decision.thread` relation with `onDelete: Cascade` (Technical
  approach → DB / migration) therefore deletes the `Decision` row whenever its `Thread` goes, which
  happens whenever its channel or root message is deleted — a verified cascade chain, not an assumption.
- Forum posts are created through `ForumPostsService`
  (`apps/api/src/modules/forum/`, named in `forum-channels.md` → Deviations → Code placement) via a
  Prisma transaction that creates the root `Message`, its `Thread`, and any `ThreadTag` rows together.
  A decision proposal's creation transaction is the same shape plus a nested `Poll` create.
- `Poll`/`PollOption`/`PollVote` (`apps/api/prisma/models/messages.prisma:1-41`) already model exactly
  the vote this feature needs: `Poll.messageId String? @unique` attaches a poll to any channel
  message (`:2`), `allowMultiple`/`showVoters`/`expiresAt`/`closedAt` are all present, and
  `PollVote`'s primary key `@@id([pollId, optionId, userId])` (`:37`) already enforces one vote per
  member per option with no weight column.
- `PollsService.createChannelPoll` (`apps/api/src/modules/polls/polls.service.ts:49-90`) is the
  existing entry point: it calls `MessagesService.requireCanPostInChannel` (which a `DECISION`
  channel proposal cannot reuse as-is, because a proposal is a titled thread post like a forum post,
  not a flat channel message — same reasoning `forum-channels.md` gives for `requireCanPostInForum`),
  builds the poll via a private `this.pollCreateData(userId, input)` helper (referenced at
  `polls.service.ts:69,128`, not exported), and creates the `Message` + `Poll` in one
  `prisma.$transaction`. `pollCreateData` is private, so a `DecisionsService` proposal-creation
  transaction cannot call it directly today. **Decided** (`open-questions.md` #62, closed
  2026-09-25): it is promoted to an exported function rather than duplicated — see Voting →
  `pollCreateData` and Technical approach.
- `pollStatus(poll, now)` (`apps/api/src/modules/polls/poll-status.ts:16-22`) computes `OPEN`/`CLOSED`
  from `closedAt`/`expiresAt` with no scheduler — the same "computed status" pattern this doc's
  proposal status uses for whether voting is still open, but a decision's own status
  (`PROPOSED`/`ACCEPTED`/`REJECTED`/`SUPERSEDED`) is not purely computed: the accept/reject outcome
  requires a persisted decision once the deadline passes, so voters and the index agree after that
  moment (an index built by computing "was accepted" live from vote counts at every read would flip a
  decision's status mid-read if a vote landed after the deadline but before the sweep ran).
- Scheduled, at-a-real-wall-clock-time work has one existing pattern in this repo:
  `ReminderSweepService` (`apps/api/src/modules/saved-messages/reminder-sweep.service.ts:19-44`) — an
  `onApplicationBootstrap`-started, un-refed `setInterval`, with an `isSweeping` overlap guard and a
  conditional `updateMany` claim (`remindedAt: null` in the `WHERE`). `scheduled-messages.md` follows
  the identical shape for `ScheduledMessageSweepService`, explicitly rejecting `@nestjs/schedule` and
  BullMQ (`scheduled-messages.md` → Trade-offs) because the repo runs everything in-process with no
  job-queue infrastructure. `apps/api/package.json` has no `@nestjs/schedule`, `bullmq`, or
  `node-cron` dependency (grepped, same finding `scheduled-messages.md` → Current Behavior already
  recorded).
- `Permission` (`apps/api/src/modules/permissions/channel-permission.ts:1-14`) is
  `ViewChannel, SendMessages, ManageMessages, ManageChannels, ManageServer, ManageRoles, KickMembers,
  BanMembers, CreateInvite, ConnectVoice, SpeakVoice, UploadFiles, MuteMembers` — there is no
  `PUBLISH`/`DECIDE`/`MODERATE_DECISIONS` bit. `announcement-channels.md` and `forum-channels.md` both
  established this repo's precedent of reusing `ManageMessages`/`ManageChannels` rather than minting a
  new permission for a new moderator-only action; this doc follows the same precedent for
  "resolve early" and "supersede."
- `MessageSearchFilters`/`buildMessageSearchWhere` (`apps/api/src/modules/messages/messages.search.ts:1-40+`)
  filter on `Message.content` (and author/channel/date/link/file) with no channel-type exclusion —
  every channel type's messages are searchable today, including `FORUM` post roots
  (`forum-channels.md` → Deviations: "channel search runs on it"). No code change is needed for a
  decision proposal's root message to appear in search; see Changes → Search.
- Latest migration folder: `apps/api/prisma/migrations/20260922003000_add_announcement_channels`
  (`ls`, grepped); a new migration follows the same `YYYYMMDDHHmmss_description` naming.
- The web sidebar branches `item.type` for the icon at
  `apps/web/src/components/workspace/ChannelSidebar.tsx:150-155` (`FORUM` → `MessagesSquare`, `STAGE`
  → `Radio`, `ANNOUNCEMENT` → `Megaphone`) and the create-channel dropdown offers each as an explicit
  menu item (`:199-214`).

## Changes

### Status lifecycle

```
PROPOSED --(deadline reached, or MANAGE_MESSAGES resolves early)--> ACCEPTED
PROPOSED --(deadline reached, or MANAGE_MESSAGES resolves early)--> REJECTED
ACCEPTED --(MANAGE_MESSAGES marks superseded by a newer decision)--> SUPERSEDED
```

- `ACCEPTED`, `REJECTED`, `SUPERSEDED` are terminal: no transition leaves them. Re-resolving,
  re-superseding, or superseding a `REJECTED`/`SUPERSEDED` row is refused.
- There is no `DISCUSSING` state (see Scope → Out of scope). "Under discussion" is simply
  `PROPOSED` with a not-yet-passed deadline; the thread's replies are the discussion.
- Every transition is a single conditional `UPDATE`, per `rules/failure-and-state.md` ("the allowed
  transition belongs in the `WHERE`, not in an `if` above the update"):
  - Resolve: `UPDATE "Decision" SET status = <ACCEPTED|REJECTED>, decidedAt = now(), decidedById = ?
    WHERE id = ? AND status = 'PROPOSED'` — an affected-row count of `0` means someone already
    resolved it (deadline sweep raced a manual resolve, or a double-click); the caller sees
    `409 Decision already resolved`, not a second write.
  - Supersede: `UPDATE "Decision" SET status = 'SUPERSEDED', supersededByDecisionId = ?
    WHERE id = ? AND status = 'ACCEPTED'` — `0` rows means it was not `ACCEPTED` (already superseded,
    still `PROPOSED`, or `REJECTED`); `409 Decision is not an accepted decision`.
  - Expire (deadline reached, quorum not met — decided, see Voting → Quorum):
    `UPDATE "Decision" SET "expiredAt" = now() WHERE id = ? AND status = 'PROPOSED' AND "expiredAt" IS
    NULL` — this does **not** change `status`; the decision stays `PROPOSED` and waits for a manual
    resolve. `0` rows means it was already marked or already resolved.
- **What can fail here** (`rules/failure-and-state.md` — before writing the write path):
  1. What can fail: the poll vote count read and the status write are not atomic without care; the
     sweep process can die between reading due proposals and writing the outcome; two API instances
     can race the same deadline.
  2. State if it fails mid-way: a `Decision` stuck in `PROPOSED` past its deadline is not a broken
     state — it is simply "not yet resolved," and the next sweep tick (any instance) resolves it. No
     partial decision write is possible because the outcome is computed and written in one `UPDATE`.
  3. Same request twice: the sweep's conditional `UPDATE ... WHERE status = 'PROPOSED'` makes
     re-processing the same due id a no-op on the second attempt (`0` rows affected, logged and
     skipped) — the same idempotency shape `ReminderSweepService`'s claim already uses.

### Voting — reusing `Poll`

- Creating a proposal creates its root `Message`'s `Poll` in the same transaction as the `Thread` and
  `Decision` rows, with exactly two fixed options, in this fixed order: `Accept`, `Reject` —
  `allowMultiple: false` (accept/reject is exclusive), `showVoters: true` (decided: organizational
  decisions need an auditable "who voted which way," unlike the general poll default of `false` —
  see Trade-offs), `expiresAt` set to the proposal's `votingDeadlineAt`.
- No new vote-casting, vote-changing, or vote-count code is written: `PUT /polls/:pollId/votes`,
  `POST /polls/:pollId/close`, and `GET /polls/:pollId` (`polls.controller.ts`, referenced by
  `polls.md` → API) work unchanged on a decision's poll — a client votes on a decision exactly like it
  votes on any other poll message.
- **`pollCreateData` — closed, promoted to a shared function, not duplicated**
  (`open-questions.md` #62, closed 2026-09-25). `PollsService.pollCreateData` is private
  (`polls.service.ts:69,128`). Per `rules/code-design.md` ("a business rule lives in exactly one
  layer — duplicated into the controller, it will drift"), the fix is a small, real code change: move
  `pollCreateData`'s body into an exported function (e.g. `buildPollCreateData` in `poll.format.ts`,
  which already holds the shared poll include/formatting helpers `PollsService` and `MessagesService`
  both import — `message.format.ts:4`), and have `PollsService.createChannelPoll`/`createDmPoll` call
  the exported function instead of a private method. `DecisionsService`'s proposal-creation
  transaction then calls the same exported function — one real consumer today (`DecisionsService`),
  not a speculative export. This is an implementation-time code change this doc directs, not a design
  choice left open.
- **Quorum — minimal addition, poll does not have one; below-quorum stays `PROPOSED`, decided**
  (`open-questions.md` #60, closed 2026-09-25). `Poll`/`PollOption`/`PollVote` have no quorum or
  minimum-participation concept (grepped `messages.prisma:1-41` — no such column).
  `Decision.quorumCount Int?` is the minimal addition: a plain integer threshold on the `Decision` row
  itself, not on `Poll`, so `Poll` stays a general-purpose, quorum-agnostic building block. At the
  deadline, the sweep reads the poll's total vote count (`PollVote` rows for that `pollId` — one row
  per member, per `PollVote`'s own primary key) and compares it to `quorumCount`:
  - **Quorum met** (or `quorumCount` is `null`, meaning no requirement): the accept/reject rule below
    decides — `ACCEPTED` or `REJECTED`.
  - **Quorum not met**: the decision does **not** auto-resolve to `REJECTED`. It stays `PROPOSED`,
    and the sweep sets a new column, `Decision.expiredAt`, marking that the voting window closed
    without enough participation to decide anything. The web view shows it as "expired — needs manual
    resolution." Only a `MANAGE_MESSAGES` holder can then resolve it (the same `resolve` endpoint
    already described in Status lifecycle and Who can change status — it is not a new action).
  - **Reason**: this feature's entire value is organizational memory. Auto-writing `REJECTED` for a
    proposal nobody voted on would misrepresent history — a later reader would reasonably assume
    someone considered it and voted it down. Leaving it visibly unresolved ("expired, needs a human")
    is the honest state; a moderator's manual resolve is itself now the recorded decision-maker.
  - Setting `expiredAt` is its own conditional write, same discipline as every other transition:
    `UPDATE "Decision" SET "expiredAt" = now() WHERE id = ? AND status = 'PROPOSED' AND "expiredAt" IS
    NULL` — a `0`-row result means another sweep tick or a manual resolve already handled it; skip,
    no error. `expiredAt` being set does not change `status`; the later manual `resolve` still runs
    the same `UPDATE ... WHERE status = 'PROPOSED'` from Status lifecycle (it does not need to check
    `expiredAt` — a `PROPOSED` decision is resolvable whether or not it has expired).
- **Accept/reject rule**, applied only once quorum is met (or none is required): `acceptVotes >
  rejectVotes` → `ACCEPTED`; `acceptVotes <= rejectVotes` (a tie, including 0–0 when no quorum is
  set) → `REJECTED` — **closed** (`open-questions.md` #60, closed 2026-09-25): a tie has no majority
  to act on, so it defaults to "no change," the same reasoning a below-quorum vote does not get, since
  a tie means people *did* participate and reached no consensus, which is a real, recordable outcome
  (unlike zero participation).

### Deadline resolution

- `DecisionSweepService`, new, follows `ReminderSweepService` exactly: an `onApplicationBootstrap`
  un-refed `setInterval` (`ReminderSweepService.onApplicationBootstrap`,
  `reminder-sweep.service.ts:31-36`) with an `isSweeping` overlap guard, polling every 30 seconds (a
  decision deadline has none of scheduled-messages' "post it now" urgency, so a longer interval than
  `ReminderSweepService`'s reminder cadence is acceptable — a specific number to confirm at
  implementation time, not load-bearing to this doc).
- Each tick: `SELECT id FROM "Decision" WHERE status = 'PROPOSED' AND "expiredAt" IS NULL AND
  "votingDeadlineAt" <= now() LIMIT 50` (the `"expiredAt" IS NULL` guard skips decisions already
  marked expired-and-waiting-for-manual-resolve, so the tick does not keep re-reading them every 30
  seconds), then for each id: read the poll's total vote count, and
  - below `quorumCount` (when set) → the **expire** write (Status lifecycle) — stays `PROPOSED`, sets
    `expiredAt`;
  - quorum met or no `quorumCount` → the **resolve** write (Status lifecycle) — `ACCEPTED`/`REJECTED`
    per the accept/reject rule.
  A `0`-row update on either write means another instance's tick, or a manual resolve, already
  claimed it — skip, no error.
- No `@nestjs/schedule` or queue library is added — same reasoning `scheduled-messages.md` gives:
  `ReminderSweepService`'s plain-timer-plus-conditional-claim pattern already proves correct across
  multiple API instances, and a decision deadline needs even less precision than a scheduled message
  send.

### Who can change status

- **Resolve early** (before the deadline): a member holding `MANAGE_MESSAGES` on the channel —
  mirrors `polls.md`'s "closing is allowed only by the poll's creator or a member holding
  MANAGE_MESSAGES" (`polls.md` → Rules), except a decision has no "creator closes their own" case:
  resolving early sets the outcome, not merely ending voting, so it is moderator-only, not
  proposer-only (a proposer resolving their own proposal `ACCEPTED` with no oversight would defeat the
  point of a vote).
- **Supersede**: a member holding `MANAGE_MESSAGES` on the channel, on a new proposal that names the
  `ACCEPTED` decision it replaces (`supersedes: <decisionId>` at proposal creation, or a separate
  "Mark as superseded" action once the new proposal is itself `ACCEPTED` — decided: superseding
  happens as an explicit action after the new decision is `ACCEPTED`, not automatically, so a proposal
  that references an old decision but is itself `REJECTED` never silently supersedes anything).
- **Create a proposal**: any member holding `SendMessages` on the channel, same bar as sending an
  ordinary message or a forum post — not moderator-gated, matching `polls.md`'s "creating a channel
  poll runs every gate a new top-level message passes."

### Search

- A decision proposal's root `Message.content` (the proposal body) is an ordinary `Message` row like
  a forum post root, so `buildMessageSearchWhere` (`messages.search.ts`) matches it with no code
  change — the same "channel search runs on it" conclusion `forum-channels.md` reached for forum
  posts. **Decided: closed decisions stay searchable in message search**, because hiding them would
  make the exact "what did we decide" question harder to answer from the one search users already
  know, and the decision index (below) is additive, not a replacement for search.
- The decision index is a separate, decision-specific view (status/date filtered, server-wide) that
  message search cannot produce today (search has no channel-type or decision-status filter) — it is
  new, not a variant of search.

### Rules / Flow — proposal creation

1. `POST /channels/:channelId/decisions` on a `DECISION` channel: `{ title, content, attachments?,
   votingDeadlineAt, quorumCount? }`.
2. Same gates as a forum post (`forum-channels.md` → Rules): `SendMessages`, `requireNotTimedOut`,
   slowmode, rules screening (onboarding), AutoMod screening of title + body together — via a new
   `MessagesService.requireCanPostInDecision`, mirroring `requireCanPostInForum`
   (`messages.service.ts:186-190`).
3. `title`: 1–150 characters after trim, required (a decision title needs to read well in the index
   list, hence longer than a forum post's 100-character cap — `forum-channels.md` → Rules). `content`:
   same empty-content rule as any thread root (`messages.service.ts:284-286` per `forum-channels.md`).
4. `votingDeadlineAt`: **closed — reuses the poll's own bound exactly, no separate bound**
   (`open-questions.md` #61, closed 2026-09-25). The vote *is* the underlying `Poll`'s `expiresAt`
   (Voting → reusing `Poll`); a decision-specific bound that differs from the poll's own
   `validatePollExpiry` window (`apps/api/src/modules/polls/poll-status.ts:24-31`, 5 minutes with a
   1-minute grace to 7 days) would let a caller set a `votingDeadlineAt` the underlying poll then
   silently closes early (or refuses outright) — two limits on one mechanism is exactly the kind of
   inconsistency that causes a bug. `DecisionsService` calls the already-exported `validatePollExpiry`
   directly (no new bound constants), so the two can never drift. Required (unlike a poll's optional
   `expiresAt` — a decision proposal without a deadline can never resolve automatically, which defeats
   the "index of closed decisions" goal). If a longer window is ever needed, both the poll's bound and
   the decision's must be raised together, in the same change, and said so explicitly in this doc's
   next revision.
5. `quorumCount`: optional, positive integer, no upper bound enforced beyond the channel's actual
   member count (a quorum larger than membership simply always fails, which is a caller mistake, not
   a case the API prevents).
6. On success: a `Thread` rooted at a new `Message` (title on `Thread.title`, reused from the forum
   schema), that message's `Poll` (Accept/Reject, as above), and a `Decision` row, created together in
   one `prisma.$transaction`, same shape as `ForumPostsService`'s post-creation transaction.
7. Realtime: `decision:created` to `channelRoom(channelId)`, mirroring `forum:post-created`
   (`forum-channels.md` → Realtime); `decision:updated` on any status transition, to the same room
   plus a `server:<serverId>:decisions` room (new) so an open decision index updates live.

### Edge cases

| Case | Expected behavior |
|---|---|
| No `quorumCount` set, 0 votes at deadline | Quorum is vacuously met (no requirement) → accept/reject rule applies to `0 <= 0` → `REJECTED` (a tie, not "no participation" in this case, since there was no minimum to fail). |
| `quorumCount` set, votes below it at deadline | **Stays `PROPOSED`**, `expiredAt` set (decided, `open-questions.md` #60) — not auto-`REJECTED`. Visible as "expired, needs manual resolution"; a `MANAGE_MESSAGES` holder resolves it via the same `resolve` endpoint. |
| Tie vote (quorum met or not required) | `REJECTED` — a tie is a real, recorded "no consensus" outcome, decided in Voting → Accept/reject rule. |
| Duplicate resolve (deadline sweep and a manual resolve race) | Conditional `UPDATE ... WHERE status = 'PROPOSED'` — whichever commits first wins; the loser gets `0` affected rows (sweep: skip silently; manual: `409`). |
| Expired proposal never picked up (API down at deadline) | Resolves (or expires, per quorum) on the next tick after restart — `votingDeadlineAt <= now()` still matches; no time-boxed miss unlike `ScheduledMessageSweepService`'s `SENDING`-timeout case, because resolving a decision has no external side effect to worry about re-doing. |
| Manual resolve of a decision already marked `expiredAt` | Allowed — the `resolve` endpoint's `UPDATE ... WHERE status = 'PROPOSED'` does not check `expiredAt`; a `PROPOSED` decision is resolvable whether or not it expired. |
| Unauthorized resolve/supersede (missing `MANAGE_MESSAGES`) | `403`. |
| Resolve a channel-view-only member's `GET` on an already-resolved decision | Reads fine (`200`); only the resolve/supersede *write* is gated. |
| Supersede target not `ACCEPTED` | `409 Decision is not an accepted decision`. |
| Proposal in a non-`DECISION` channel | `POST /channels/:channelId/decisions` on `TEXT`/`FORUM`/etc. → `400 Channel is not a decision channel`, mirroring `requireReadableForumChannel`'s `400 Channel is not a forum channel`. |
| Caller cannot view the channel | `404`, matching `requireReadableChannel`'s not-found-not-forbidden convention for `ViewChannel` failures. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/prisma/models/channels.prisma` | `ChannelType` gains `DECISION`. |
| `apps/api/prisma/models/messages.prisma` (or a new `decisions.prisma` model file, following the repo's per-domain model-file split seen in `ls apps/api/prisma/models/`) | New `DecisionStatus` enum and `Decision` model. |
| new migration `apps/api/prisma/migrations/<timestamp>_add_decision_channels/` | Hand-written; adds the enum value, `DecisionStatus`, and the `Decision` table. |
| `apps/api/src/modules/channels/dto/create-channel.dto.ts` | `@IsIn([...])` gains `'DECISION'`. |
| `apps/api/src/modules/channels/channels.service.ts` | New `requireReadableDecisionChannel`, mirroring `requireReadableForumChannel` (`:192-197`). |
| `apps/api/src/modules/messages/messages.service.ts` | New `requireCanPostInDecision`, mirroring `requireCanPostInForum` (`:186-190`). |
| `apps/api/src/modules/polls/polls.service.ts`, `apps/api/src/modules/polls/poll.format.ts` | `pollCreateData` (private, `polls.service.ts:69,128`) is promoted to an exported function (e.g. `buildPollCreateData` in `poll.format.ts`); `createChannelPoll`/the DM equivalent call the exported function instead of the private method — **closed**, `open-questions.md` #62; see Voting → `pollCreateData`. |
| `apps/api/src/modules/decisions/` (new module) | `decisions.module.ts`, `decisions.service.ts` (create/resolve/supersede/list), `decision-sweep.service.ts` (the interval), `decision.format.ts`, `dto/create-decision.dto.ts`, `dto/resolve-decision.dto.ts`. |
| `apps/api/src/modules/messages/messages.search.ts` | No change (see Changes → Search). |
| `packages/shared/src/api-contract.ts` | `ChannelType` gains `'DECISION'`; new `DecisionView`, `DecisionStatus` union, `CreateDecisionInput`. |
| `apps/web/src/components/workspace/ChannelSidebar.tsx` | New icon branch (e.g. `Gavel` or `CheckSquare`) alongside `:150-155`, new "Create decision channel" menu item alongside `:199-214`. |
| `apps/web/src/components/workspace/types.ts` | `ChannelCreateType` gains `'DECISION'`. |
| `apps/web/src/components/decisions/` (new) | `DecisionChannelView.tsx`, `DecisionCard.tsx` (reuses `PollCard` for the vote UI), `NewDecisionDialog.tsx`, `DecisionIndexView.tsx` (server-wide index). |
| `apps/web/src/i18n/locales/en.ts`, `vi.ts` | New `decision.*` keys. |

**API contract**

| Method | Path | Body | Response | Status |
|---|---|---|---|---|
| `POST` | `/channels/:channelId/decisions` | `{ title, content, attachments?, votingDeadlineAt, quorumCount? }` | `201 { decision, thread, rootMessage }` | `201` |
| `GET` | `/channels/:channelId/decisions` | query: `cursor?, status?` | `{ decisions: DecisionView[], nextCursor? }` | `200` |
| `GET` | `/decisions/:decisionId` | — | `{ decision, thread, rootMessage }` | `200` |
| `POST` | `/decisions/:decisionId/resolve` | `{ status: 'ACCEPTED' \| 'REJECTED' }` | `{ decision }` | `200`, `409` if not `PROPOSED` |
| `POST` | `/decisions/:decisionId/supersede` | `{ supersededByDecisionId }` | `{ decision }` | `200`, `409` if not `ACCEPTED` |
| `GET` | `/servers/:serverId/decisions` | query: `cursor?, status?, from?, to?, channelId?` | `{ decisions: DecisionView[], nextCursor? }` | `200` — the index |

`DecisionView`: `{ id, channelId, channelName, threadId, title, status, votingDeadlineAt, quorumCount,
expiredAt, decidedAt, decidedById, supersededByDecisionId, poll: PollView, proposer: { id,
displayName, avatarUrl } }` — reuses `PollView` (`polls.md` → API) unchanged for the vote counts.
`expiredAt` set with `status` still `PROPOSED` is the client's signal to render "expired — needs
manual resolution" (Voting → Quorum, decided).

Errors: `400` bad title/deadline/quorum, non-`DECISION` channel · `403` missing `SendMessages`
(create) or `MANAGE_MESSAGES` (resolve/supersede) · `404` channel/decision not found or not viewable
· `409` invalid status transition (resolve on non-`PROPOSED`, supersede on non-`ACCEPTED`).

**DB / migration**

- `ChannelType` enum: add `DECISION` — Postgres `ALTER TYPE ... ADD VALUE`. Per `database.md` and this
  repo's own precedent (`announcement-channels.md` → Risks: *"the ChannelType enum value itself is
  not dropped on rollback (Postgres limitation)"*), **this is a one-way change**: a Postgres enum
  value, once added, cannot be removed by a migration `down()` without recreating the whole type. Any
  `DECISION` channel created before a rollback keeps that type in the database after the code stops
  understanding it. Called out again in Risks below, as the instructions require.
- New `DecisionStatus` enum: `PROPOSED, ACCEPTED, REJECTED, SUPERSEDED`.
- New `Decision` table:
  ```prisma
  model Decision {
    id                     String         @id @default(cuid())
    channelId              String
    threadId               String         @unique
    proposerId             String
    status                 DecisionStatus @default(PROPOSED)
    votingDeadlineAt       DateTime
    quorumCount            Int?
    /// Set by the deadline sweep when the voting window closed without meeting quorumCount; status
    /// stays PROPOSED. Null once resolved or if quorumCount is null. Not a status value on its own
    /// (open-questions.md #60): a proposal nobody voted on must not silently read as REJECTED.
    expiredAt              DateTime?
    decidedAt              DateTime?
    decidedById            String?
    supersededByDecisionId String?        @unique
    createdAt              DateTime       @default(now())
    channel                Channel        @relation(fields: [channelId], references: [id], onDelete: Cascade)
    thread                 Thread         @relation(fields: [threadId], references: [id], onDelete: Cascade)
    proposer               User           @relation("DecisionProposer", fields: [proposerId], references: [id])
    decidedBy              User?          @relation("DecisionDecider", fields: [decidedById], references: [id])
    supersededBy            Decision?     @relation("DecisionSupersession", fields: [supersededByDecisionId], references: [id])

    @@index([channelId, status])
    @@index([status, votingDeadlineAt])
    @@index([status, expiredAt])
  }
  ```
  No `pollId` column: the poll is reached through `thread.rootMessage.poll` (`Poll.messageId`,
  already unique) — one less duplicated reference to keep in sync (see Current behavior).
  `votingDeadlineAt` is `NOT NULL` on a brand-new table, so the "nullable or DEFAULT" rule for adding
  a column to a populated table (`database.md` → Migrations) does not apply here — the table has no
  existing rows. `channel`/`thread` relations use `onDelete: Cascade`, matching the verified cascade
  chain in Current behavior (`Thread.channel`/`Thread.rootMessage` cascades).
- Every new column is either on a new table or, for `Message`/`Thread`, not touched at all — no
  existing column changes, no backfill.
- Migration file: `<timestamp>_add_decision_channels`, hand-written. `down()` drops the `Decision`
  table and the `DecisionStatus` enum; the `ChannelType.DECISION` value is **not** removed (documented
  limitation above).
- No lock-duration concern: the new table is empty at creation time; the enum `ADD VALUE` is a
  metadata-only operation with no table rewrite.

**Libraries** — none new. Reuses `class-validator`, `PollsService`'s poll shape (via the exported
`pollCreateData`, decided above), and the existing `setInterval` sweep pattern.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): new `ChannelType = DECISION`** | Follows this repo's established path (`forum-channels.md`, `stage-channels.md`, `announcement-channels.md`) exactly: a dedicated sidebar icon, a dedicated create flow, and a channel-level gate (`requireCanPostInDecision`) that cannot be bypassed by posting an ordinary message. Matches how the user's own prompt frames the feature ("a channel type"). | A fourth precedent of the same enum-extension cost: the `ALTER TYPE ... ADD VALUE` migration is one-way (see DB / migration and Risks) — this repo now carries five non-`TEXT`/`VOICE` channel-type branches wherever code pattern-matches on `ChannelType` without a `default` case, same risk `forum-channels.md` already flagged for its own addition. | **Chosen** — directly what was asked, and the smallest-diff option that reuses the repo's own established channel-type pattern rather of inventing a new one. |
| B: reuse a `FORUM` channel + a `decision` tag, with `ThreadTag`-based status | No new `ChannelType` value, no new enum-migration one-way cost; forum tags already exist and are renamable/orderable. | A tag is a label, not a state machine — nothing stops two tags (`accepted` and `rejected`) being applied to the same post at once, nothing enforces the transition table in Status lifecycle, and "resolve" would just be "apply a tag," bypassing every guard this doc's conditional `UPDATE`s provide. Voting would still need the same `Poll` embedding either way, so this option saves no real code, only the enum value. Quorum and deadline-sweep resolution would need their own table regardless of whether the channel is `FORUM` or `DECISION`, so the "channel type" question is orthogonal to "does the state machine exist." | Ruled out — a tag cannot express or enforce a state machine; the acceptance criteria explicitly require invalid-transition rejection (`409`), which a tag-based model cannot give without building the same `Decision` table anyway, at which point the tag route has all of option A's cost and none of its clarity. |
| **C (chosen): `Decision` as its own table referencing `Thread`, not columns added directly onto `Thread`** | Keeps `Thread` free of decision-only fields; `forum-channels.md`'s own precedent of adding `title`/`tags` directly to `Thread` was acceptable for two nullable columns, but a decision needs `status`, `votingDeadlineAt`, `quorumCount`, `decidedAt`, `decidedById`, `supersededByDecisionId` — six columns that mean nothing on a reply-originated or forum thread. A separate table keeps that entirely off `Thread`. | One more join to read a proposal's full state (`Thread` + `Decision` + `Message` + `Poll`), versus everything living on one row. | **Chosen** — six decision-only nullable columns on every `Thread` row is a materially bigger pollution of a shared table than forum's two; a dedicated table with a `@unique threadId` costs one join and keeps `Thread` legible for its other two callers (reply threads, forum posts). |
| D: columns directly on `Thread`, mirroring forum's `title`/`tags` precedent exactly | Smallest schema diff; one fewer table; matches forum's own chosen precedent literally. | `Thread` becomes a grab-bag of three unrelated feature's fields (thread reply metadata, forum title/tags, decision status/deadline/quorum/decider/supersession) — every future reader of `Thread` has to know which fields apply to which channel type; `rules/code-design.md`'s "a module changes for two unrelated reasons is two modules" reasoning applies at the column level here. | Ruled out — the field count crosses from "small, forum-shaped addition" into "shared table doing three jobs." |
| **E (chosen, closed): reuse `Poll` unchanged; quorum as a `Decision`-only column; weighted voting not built** | Zero new vote-counting code, zero new race conditions in vote casting (`PollVote`'s existing primary key and `polls.md`'s existing `SELECT ... FOR UPDATE` transaction on vote replace already cover this); the smallest correct answer to "does the existing poll suffice," with no speculative schema left behind for a feature nobody has asked to build. | Quorum sits one join away from the vote count it gauges (`Decision.quorumCount` next to `Poll.votes`, not on `Poll` itself), so a reader must know to check both tables; weighted voting is not available at all — a real future need is a new task doc, not a hidden column in this one. | **Decided** (`open-questions.md` #63, closed 2026-09-25) — v1 ships quorum only; weighted voting is out of scope entirely (Scope → Out of scope), not sketched as a follow-up column in this doc (YAGNI). |
| F: add `quorumCount`/a weight column directly to `Poll` | Every poll would gain quorum/weighting "for free," including ordinary non-decision polls. | Every existing poll caller (`/poll` slash command, DM polls) would carry unused decision-only semantics; `polls.md`'s existing acceptance criteria say nothing about quorum or weight, so this changes a live, already-implemented feature's contract for a caller that does not need it — a repurposing of a shared field the pitfalls rule explicitly warns against ("never repurpose a field — add one", `rules/code-design.md`). | Ruled out — the quorum concept belongs to decisions, not to polls in general. |

What the chosen option (A + C + E) costs: a fourth `ChannelType` branch to audit everywhere the
codebase pattern-matches without a `default` case (same risk class `forum-channels.md` already
flagged); one extra join to read a proposal's full state (`Decision` → `Thread` → `Message` → `Poll`);
and a small, real code change to `PollsService` — promoting `pollCreateData` from private to exported
(Voting → `pollCreateData`, decided) — so `DecisionsService` builds the identical poll shape instead
of a copy that could drift.

## Risks & rollback

- **Risk — the enum value is one-way.** Adding `DECISION` to `ChannelType` is a Postgres
  `ALTER TYPE ... ADD VALUE`, which **cannot be reverted by a migration `down()`** without recreating
  the enum type entirely (`database.md`; this repo's own precedent,
  `announcement-channels.md` → Risks & rollback: *"The ChannelType.ANNOUNCEMENT enum value cannot be
  removed by down() (Postgres limitation) ... any ANNOUNCEMENT channel created before rollback keeps
  that type in the database even after the code stops understanding it"*). The same is true here: a
  rollback of this feature's code leaves any already-created `DECISION` channel in the database with a
  type the reverted code does not recognize — the rollback plan must treat this as "the channel
  renders as an unrecognized type client-side," not as a data-loss bug to fix.
- **Risk**: a fourth non-`TEXT`/`VOICE` channel type means every existing `switch`/ternary on
  `ChannelType` without a `default` case (sidebar icon, create-channel dropdown, any future one) needs
  auditing — the same risk `forum-channels.md` → Risks already named for its own addition, now
  compounding a fourth time.
- **Risk**: a below-quorum decision stays `PROPOSED` with `expiredAt` set indefinitely if no
  `MANAGE_MESSAGES` holder ever resolves it manually — unlike the deadline sweep (which always
  terminates a decision that meets or has no quorum), an expired-for-lack-of-quorum decision has no
  automatic second deadline. Accepted trade-off of the decision made for #60 (a stale, honestly-labeled
  `PROPOSED` decision is preferred over a falsely-labeled `REJECTED` one); not covered by this doc.
- **Risk**: `PollsService.pollCreateData` must actually be promoted to an exported function during
  implementation (Voting → `pollCreateData`, decided) — if that refactor is skipped and
  `DecisionsService` reimplements the poll-create shape independently instead, it can silently drift
  from `PollsService`'s own validation (`normalizePollText`, `validatePollExpiry`). The decision is
  made; the risk is only in not following through on it at implementation time.
- **Not covered**: weighted voting (Scope → Out of scope, `open-questions.md` #63, closed), a
  "discussing" status, editing a proposal after creation, re-opening a resolved decision, bulk
  moderation of decisions.
- **Rollback**: revert the code; the migration's `Decision` table and `DecisionStatus` enum drop
  cleanly in `down()`. The `ChannelType.DECISION` enum value itself does not, per the risk above —
  same one-way limitation `announcement-channels.md` already documented for its own addition.

## Test plan

Not covered by automated tests — this repo forbids `*.test.ts`/`*.spec.ts` files and test
runners/configs (`RULE.md`, Code Quality Rules: *"Do not create automated test files ... Verify
changes with typecheck, lint, build, and a written manual verification scenario"*). Verify with
`npm run typecheck`, `npm run lint`, `npm run build`, and the i18n/file-size checks this repo already
runs for a channel-type addition (`npm run i18n:check`, `npm run check:file-size`, following
`forum-channels.md`'s Test Plan).

**Manual**

1. A manager creates a `DECISION` channel, then a member with `SendMessages` posts a proposal (title,
   body, a 5-minute voting deadline, no quorum) → the channel shows the proposal as `PROPOSED` with an
   Accept/Reject poll.
2. Two members vote Accept, one votes Reject → after the deadline passes, the next sweep tick
   resolves the proposal to `ACCEPTED` (2 > 1) → `GET /servers/:serverId/decisions?status=ACCEPTED`
   lists it in the index.
3. A second proposal with a 5-minute deadline and `quorumCount: 10` gets 2 votes total (Accept
   leading Reject) → after the deadline, the sweep does **not** resolve it: it stays `PROPOSED`,
   `expiredAt` gets set, and the web view shows "expired — needs manual resolution," not `REJECTED`.
   A member with `MANAGE_MESSAGES` then resolves it manually (`ACCEPTED` or `REJECTED`) → it leaves
   `PROPOSED` only at that point, and the index now shows it under the chosen status.
4. A member with `MANAGE_MESSAGES` resolves a still-`PROPOSED` proposal early as `REJECTED` → it
   appears in the index as `REJECTED` immediately, without waiting for the sweep.
5. **Failure case — invalid transition**: calling `POST /decisions/:id/resolve` a second time on the
   now-`REJECTED` decision from step 4 → `409 Decision already resolved`, not a silent `200`.
6. **Failure case — missing permission**: a member without `MANAGE_MESSAGES` on the channel calls
   `POST /decisions/:id/resolve` on a `PROPOSED` decision they can view → `403`.
7. A `MANAGE_MESSAGES` holder marks the `ACCEPTED` decision from step 2 as superseded by a new,
   separately-created and `ACCEPTED` decision → status flips to `SUPERSEDED`, `supersededByDecisionId`
   is set, and the index's default (non-`SUPERSEDED`) filter no longer surfaces it as the "current"
   decision on that topic.
8. Search: typing a word from the step-1 proposal's body into the existing message search returns
   that proposal's root message, unchanged behavior, no new search UI needed.

## Deployment notes

- New env vars: none.
- Migration `<timestamp>_add_decision_channels` must run before deploying the API. The
  `ALTER TYPE ChannelType ADD VALUE 'DECISION'` statement must commit before any later statement in
  the same deploy references the value — same Postgres restriction `announcement-channels.md` and
  `forum-channels.md` already handle; the migration file's statement order enforces it.
- Shared package (`packages/shared`) must be rebuilt before the API/web build, per this repo's
  monorepo build order.
- No cache/queue to clear; the sweep is an in-process timer with no external state.
- New `decision.*` i18n keys land in both `en.ts` and `vi.ts` in the same change
  (`docs/features/i18n-localization.md`).
- Breaking API change: none — `DECISION` is an additive `ChannelType` value; no existing endpoint's
  shape changes.
- This doc's conclusions are not yet folded into any `overview.md` — this repo's `docs/features/`
  keeps flat per-feature files (see `ls docs/features/`), not a `<menu>/overview.md` split, matching
  every sibling channel-type doc (`forum-channels.md`, `announcement-channels.md`).
