# Feature Spec: Channel Workflows

No-code automation that a server manager defines in the UI: **when** something happens (a trigger),
**then** the server does one or more things (a chain of actions) — without writing code.

- **Status**: draft — awaiting review
- **Date**: 2026-09-25
- **Related**: [`automod.md`](./automod.md) (rule/trigger shape, AutoMod screening reused by the
  `POST_MESSAGE` action), [`incoming-webhooks.md`](./incoming-webhooks.md) (synthetic author,
  token/hash pattern reused for the webhook trigger), [`bot-message-components.md`](./bot-message-components.md)
  (still draft/unimplemented — why "ask via a form" is cut from v1, see Scope),
  [`bot-gateway-and-slash-commands.md`](./bot-gateway-and-slash-commands.md) (the only implemented
  `Interaction` lifecycle today), [`link-previews.md`](./link-previews.md) (SSRF address policy
  reused by the HTTP action), [`scheduled-messages.md`](./scheduled-messages.md) (the in-process
  poll + conditional-claim pattern this reuses instead of a queue).

## Goal

A server manager who cannot write code opens a "Workflows" section in server settings, picks a
trigger (a message matches a rule, an external service calls a webhook URL, or a timer fires), adds
one or more actions (post a message, call an external URL), and saves it. From then on the server
runs it automatically, and the manager can see a history of runs and why one failed.

**Acceptance criteria**:

- [ ] A member with `MANAGE_SERVER` creates a `ChannelWorkflow` with exactly one trigger and 1–5
      ordered steps; an invalid trigger/step shape is rejected `400` before anything is stored.
- [ ] A `MESSAGE_MATCHES` trigger fires once per matching message (create only, not edit) and starts
      exactly one `WorkflowRun`, executing its steps in order.
- [ ] A `WEBHOOK_RECEIVED` trigger exposes a token-bearing URL; posting to it with a caller-supplied
      idempotency key starts at most one run per key; the first call to reuse a key returns the first
      run's result instead of running again.
- [ ] A `SCHEDULE` trigger fires at most once per its configured interval, claimed by exactly one API
      instance (no double-fire across instances).
- [ ] A run that fails partway through stops (later steps do not execute) and is visible to the
      workflow's owner as `FAILED` with the failing step index and a reason; earlier steps' side
      effects (e.g. a message already posted) are **not** undone.
- [ ] A workflow whose action can itself start another workflow (a `POST_MESSAGE` step posts into a
      channel another workflow's `MESSAGE_MATCHES` trigger watches) cannot cascade forever: the chain
      is cut at a fixed depth and the terminating run is marked `FAILED` with reason
      `CHAIN_DEPTH_EXCEEDED`.
- [ ] The `HTTP_CALL` action never connects to a private/internal address, never connects to a host
      the server has not explicitly allowlisted, and its configured secret header value is never
      returned by any read endpoint and never appears in run history.
- [ ] A server with an empty HTTP allowlist has `HTTP_CALL` fully disabled: no step of that type can
      be saved or run until a `MANAGE_SERVER` holder adds at least one host.
- [ ] Only `MANAGE_SERVER` holders can create, edit, enable/disable, delete a workflow, or read its
      run history; every create/update/delete/enable/disable is audited.

## Scope

**In scope**

- `ChannelWorkflow` (trigger + ordered steps), `WorkflowRun` (one execution + per-step outcome).
- Triggers: `MESSAGE_MATCHES` (keyword match against new channel messages, reusing AutoMod's
  per-trigger-type field shape — keyword only, no regex, see Scope → Out of scope),
  `WEBHOOK_RECEIVED` (a per-workflow token URL, reusing the incoming-webhook token pattern),
  `SCHEDULE` (a fixed repeating interval, no cron syntax).
- Actions: `POST_MESSAGE` (post into a channel of the same server, via a synthetic workflow author),
  `HTTP_CALL` (an outbound `POST`/`GET` with an SSRF-safe fetcher, restricted to a per-server
  hostname allowlist, optional encrypted secret header).
- A per-server HTTP allowlist (`MANAGE_SERVER`-managed list of hostnames `HTTP_CALL` may target;
  empty by default, which disables `HTTP_CALL` entirely for that server).
- Run history per workflow (status, per-step result, failure reason), visible to `MANAGE_SERVER`
  holders in server settings.
- Loop prevention across chained workflows (a fixed max propagation depth) and a per-server
  concurrent/queued-run cap.
- Audit logging for workflow CRUD and enable/disable.

**Out of scope** (spelled out, not an oversight)

- **"Ask a form via message components" as an action** — `bot-message-components.md` is still
  `draft — awaiting review` with no code (`apps/api/src/modules/bots/` has no
  `message-component*`/`interaction-callback*` file, grepped — confirmed absent). A workflow action
  that depends on an unimplemented feature is not buildable; revisit once that doc ships.
- **"Send a DM" as an action** — every DM conversation requires the two members to already be
  accepted friends before a message can be sent
  (`apps/api/src/modules/direct-messages/direct-conversations.service.ts:159-188`,
  `direct-messages.service.ts:98` calling `requireConversationMember`, which requires an existing
  `DirectConversation` row). A synthetic workflow author has no friends and no path to acquire them
  without a human accepting a request per target user — the same limitation `incoming-webhooks.md`'s
  Deviations section already names for the webhook synthetic user ("DMs ... excluded because they
  need an accepted friendship"). Cut for v1; a v2 could reuse a bot's DM path if one exists, or an
  inbox/system-notification action instead of a real DM.
- **A generic condition/expression engine** ("if content contains X AND author has role Y") — each
  trigger type carries its own small set of filter fields (channel, keywords/pattern, mention count,
  …), the same one-trigger-type-one-shape-of-fields precedent `automod.md`'s `AutoModRule` already
  uses (`docs/features/automod.md` → Changes → Rules, "Exactly one trigger type per rule"). A
  separate boolean-expression condition step is a materially bigger surface (parser, validation,
  UI) with no acceptance criterion asking for it.
- **Branching / conditional steps** ("if step 2 failed, do step 4 instead") — steps run strictly in
  order, 1–5 of them; no step reads another step's output. This keeps the executor a simple loop
  with no expression language to sandbox.
- **Editing a workflow definition takes effect mid-run** — an in-flight `WorkflowRun` always finishes
  against the step list it was claimed with (a copy taken at claim time), never a live read of the
  current definition.
- **Cron syntax, multiple schedules per workflow, timezone-aware schedules** — one fixed interval in
  minutes, evaluated in UTC, matches `scheduled-messages.md`'s own choice not to add a cron
  dependency (`apps/api/package.json` has no `node-cron`/`cron`, grepped) and keeps the scheduler the
  same conditional-claim poll already used twice in this repo.
- **Per-step retry, exponential backoff** — mirrors `scheduled-messages.md`'s "No automatic retry on
  failure" decision (retrying a partially-completed chain risks duplicate side effects); the owner
  re-runs manually by re-triggering the workflow, which always starts a **new** run.
- **Importing/exporting workflows, a marketplace/template gallery, versioning** — a fresh save-time
  feature; no acceptance criterion needs it.
- **Cross-server workflows** (a trigger in server A targeting a channel in server B) — every trigger
  and every step target must belong to the workflow's own `serverId`.
- **Regex trigger matching** — decided keyword-only for v1 (`MESSAGE_MATCHES.terms`, substring only,
  Changes → Rules item 2). `re2js` is already a dependency (`automod.md`'s `REGEX` trigger type), so
  this is not a technical blocker; it is cut for YAGNI and because a user-authored regex is one more
  untrusted-input surface to validate and reason about, even one `re2js` cannot make catastrophically
  backtrack. Revisit by reusing `automod-rules.ts`'s existing matcher if a real need shows up.
- **An admin-maintained domain allowlist as a v2-only idea** — decided: it ships in v1, not deferred
  (Changes → Rules, Technical approach). `HTTP_CALL` is disabled by default (empty allowlist) and can
  only reach hosts a `MANAGE_SERVER` holder has explicitly added.

## Current behavior

- No workflow/automation concept exists: grep for `workflow` across `apps/api/src` and
  `apps/web/src` returns no application matches.
- **AutoMod** is the closest existing "trigger → action" shape: `AutoModRule` has one
  `triggerType`/`action` per rule, evaluated by `AutoModScreeningService.screen()`
  (`apps/api/src/modules/automod/automod-screening.service.ts:59` on) on every
  `createMessage`/`createThreadMessage`/`updateMessage` call
  (`docs/features/automod.md` → Changes → Rules). Its rule cache (15 s TTL, per-instance,
  invalidated locally on write) is the direct precedent for caching a server's enabled workflows the
  same way (`automod-screening.service.ts:16-19`).
- **Incoming webhooks** already have the exact "public token URL, no session, one action" shape a
  `WEBHOOK_RECEIVED` trigger needs: `POST /webhooks/:webhookId/:token`, no `JwtAuthGuard`
  (`apps/api/src/modules/webhooks/webhook-execute.controller.ts`), the token generated with
  `generateSecretToken()`/`hashSecretToken()`/`secretTokenMatches()`
  (`apps/api/src/common/secret-token.ts:9-20`, wrapped as `generateWebhookToken`/`hashWebhookToken`/
  `webhookTokenMatches` in `apps/api/src/modules/webhooks/webhook-token.ts:1-10`), and a per-token
  Redis rate limit via `RedisFixedWindowLimiter`
  (`apps/api/src/modules/webhooks/webhook-execute.controller.ts:5,24`). It also establishes the
  synthetic-author pattern (`UserKind.WEBHOOK`, `apps/api/prisma/models/users.prisma:11-15`; one
  `User` row per webhook, excluded from member lists, sign-in, friend requests —
  `docs/features/incoming-webhooks.md` → Deviations) that `POST_MESSAGE` reuses for its own author.
- **`ScheduledMessage`/`ReminderSweepService`** are the only two "fires later" mechanisms in the
  repo, and both use the same shape: an in-process `setInterval` started in
  `onApplicationBootstrap`, un-refed, cleared in `onModuleDestroy`
  (`apps/api/src/modules/saved-messages/reminder-sweep.service.ts:18-31`), and a conditional
  `updateMany({ where: { status: 'PENDING', ... }, data: { status: 'SENDING' } })` claim so several
  API instances never both act on the same row (`docs/features/scheduled-messages.md` → Scheduling
  mechanism). **There is no job queue or `@nestjs/schedule` in this repo** — `apps/api/package.json`
  has neither (grepped); `scheduled-messages.md`'s own Deviations section explicitly chose the
  `setInterval` pattern over adding `@nestjs/schedule` (open question 11, answered "no dependency").
- **Bot message components** (`docs/features/bot-message-components.md`) is `draft — awaiting review`
  and unimplemented. To be precise about what does and does not exist (so a later reader does not
  read this as "interactions have no code at all"): `apps/api/src/modules/bots/interactions.service.ts`
  **does** exist and is a real, working 157-line module — `invoke`
  (`apps/api/src/modules/bots/interactions.service.ts:39-90`, delivering `interaction:create` via
  `RealtimePublisher.emitToRoom(botRoom(botId), ...)` at `:88-90`) and `respondToCallback`
  (`interactions.service.ts:106`, the claim-then-send handler for
  `POST /bot-api/interactions/:token/callback`, taking `BotCreateMessageDto` — confirmed present,
  body not re-read line-by-line beyond `invoke` for this doc) implement a complete slash-command
  interaction lifecycle today. What is **absent** (grepped, confirmed) is any
  message-**component** code: no `message-component*`/`interaction-callback*` file, no
  `MESSAGE_COMPONENT` interaction type, nothing a workflow could invoke to render a button/select and
  collect an answer. So "ask via a form" has no implemented mechanism to build on, even though the
  general invoke → deliver → callback lifecycle it would need is otherwise proven and running in
  production for slash commands.
- **Outbound HTTP with SSRF protection** exists once, for link previews:
  `isPublicAddress(ip)` rejects private/loopback/link-local/CGNAT/documentation ranges for IPv4 and
  IPv6 (`apps/api/src/modules/link-previews/address-policy.ts:22-27,34-58`), and `safeFetchHtml`
  resolves DNS through a `LookupFunction` that rejects the whole hostname if any resolved address is
  not public, then connects to the address that lookup approved so a DNS answer cannot change
  between validation and connection (`apps/api/src/modules/link-previews/safe-fetch.ts:39-59,93-98,109-122`).
  It is GET-only, has no request body, and never sends a caller-supplied secret; a workflow's
  `HTTP_CALL` action needs the same address policy but a wider fetch shape (method, JSON body,
  optional header).
- **Reversible secret storage** exists once, for 2FA: `createSecretBox(keyMaterial)` seals with
  AES-256-GCM (`apps/api/src/modules/auth/secret-box.ts:6-29`), keyed from
  `TWO_FACTOR_ENCRYPTION_KEY` via `twoFactorEncryptionKey(config)`
  (`apps/api/src/modules/auth/two-factor-config.ts:6-8`), with a startup assertion that production
  never runs on the dev default (`two-factor-config.ts:11-19`). This is the only precedent in the
  repo for storing something that must be **read back**, as opposed to the hash-only pattern used for
  webhook/session tokens.
- **`Message.isCrosspost`** is the repo's only existing "generated content can't re-trigger the thing
  that made it" rule: a crosspost copy can never itself be published, which stops any propagation
  loop across an arbitrary follow graph regardless of shape
  (`apps/api/prisma/models/messages.prisma:63-66`, `docs/features/announcement-channels.md:61`). It
  stops a **one-hop** loop (a copy can't re-fire the same mechanism); it does not generalize to an
  N-workflow cycle (workflow A's action triggers workflow B, whose action triggers A again), which
  needs a depth counter instead (see Changes → Loop prevention).
- `Permissions` has no automation-specific bit: `ManageServer`, `ManageChannels`, and 13 others,
  no `MANAGE_WORKFLOWS` (`packages/shared/src/permissions.ts:1-16`). `automod.md` and
  `incoming-webhooks.md` both reuse an existing permission rather than adding one
  (`docs/features/incoming-webhooks.md` → Trade-offs, citing `member-bans.md:105`'s precedent for the
  same reasoning) — automation that can post messages and call arbitrary external URLs is at least as
  sensitive as AutoMod rule management, which requires `MANAGE_SERVER`
  (`docs/features/automod.md` → Changes → Rules, "requires `MANAGE_SERVER`").
- `AuditLog` is `{ id, serverId, actorId, action: String, targetId?, metadata?: Json, createdAt }`
  (`apps/api/prisma/models/servers.prisma:195-208`), written through each module's own private
  `writeAuditLog(serverId, actorId, action, targetId?, metadata?)` helper
  (`apps/api/src/modules/messages/messages.service.ts:771-781`, mirrored per module) — no enum, any
  string is accepted.

## Changes

### Data model

```prisma
enum WorkflowTriggerType {
  MESSAGE_MATCHES
  WEBHOOK_RECEIVED
  SCHEDULE
}

enum WorkflowActionType {
  POST_MESSAGE
  HTTP_CALL
}

enum WorkflowRunStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
}

model ChannelWorkflow {
  id              String              @id @default(cuid())
  serverId        String
  name            String
  enabled         Boolean             @default(true)
  triggerType     WorkflowTriggerType
  triggerConfig   Json                // shape depends on triggerType, see Rules below
  webhookTokenHash String?            @unique // only set for WEBHOOK_RECEIVED
  nextRunAt       DateTime?           // only set/advanced for SCHEDULE
  executorUserId  String              @unique // synthetic author for this workflow's POST_MESSAGE steps
  createdById     String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  server          Server              @relation(fields: [serverId], references: [id], onDelete: Cascade)
  executorUser    User                @relation(fields: [executorUserId], references: [id])
  steps           WorkflowStep[]
  runs            WorkflowRun[]

  @@index([serverId])
  @@index([triggerType, enabled])
  @@index([nextRunAt])
}

// Per-server allowlist of hosts HTTP_CALL steps may target. Empty = HTTP_CALL disabled server-wide
// (decided; see Changes → Rules and Trade-offs).
model WorkflowHttpAllowlistEntry {
  id          String   @id @default(cuid())
  serverId    String
  // Exact hostname (`api.example.com`), or `*.example.com` to also allow every subdomain — the
  // leading `*.` is an explicit per-entry opt-in, never implied by adding the bare domain.
  hostname    String
  createdById String
  createdAt   DateTime @default(now())
  server      Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)

  @@unique([serverId, hostname])
  @@index([serverId])
}

model WorkflowStep {
  id         String             @id @default(cuid())
  workflowId String
  position   Int
  actionType WorkflowActionType
  config     Json               // shape depends on actionType, see Rules below
  workflow   ChannelWorkflow    @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([workflowId, position])
}

model WorkflowRun {
  id             String            @id @default(cuid())
  workflowId     String
  status         WorkflowRunStatus @default(PENDING)
  triggerType    WorkflowTriggerType
  idempotencyKey String?           // WEBHOOK_RECEIVED dedup key; null for other trigger types
  causeRunId     String?           // the WorkflowRun whose action produced the message/call that started this one
  depth          Int               @default(0) // 0 = started by a real trigger, N = Nth hop in a chain
  stepSnapshot   Json              // the step list at claim time, so a later edit can't change an in-flight run
  failedStepIndex Int?
  failureReason  String?
  claimedAt      DateTime?
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime          @default(now())
  workflow       ChannelWorkflow   @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@index([workflowId, createdAt])
  @@index([status, claimedAt]) // stuck-claim recovery, same shape as ScheduledMessage
  @@unique([workflowId, idempotencyKey]) // NULLs don't collide in Postgres, so this only dedups webhook runs
}
```

`User` gains `WORKFLOW` to its existing `kind UserKind` enum (`apps/api/prisma/models/users.prisma:11-15`),
alongside `HUMAN | WEBHOOK | BOT`, following the exact precedent `incoming-webhooks.md` set for
`WEBHOOK` (excluded from member lists, sign-in, friend requests, mentions — same checklist, same
enforcement points).

`executorUser` has no `onDelete` clause (defaults to `Restrict`): a workflow's synthetic `User` row
is never deleted by deleting the workflow — **decided** (closed open question 64), mirroring
`incoming-webhooks.md`'s exact precedent, "Delete removes the row; the synthetic User row stays, so
past messages keep the stored name and avatar" (`incoming-webhooks.md` → Deviations). See Changes →
Rules item 10.

Migration: `<next-timestamp>_add_channel_workflows`, run after
`20260922003000_add_announcement_channels` (the latest migration at doc time).

### Rules / Flow

1. **Create/edit** (`MANAGE_SERVER` only): `name` 1–100 chars; exactly one `triggerType` with its own
   config; 1–5 `steps`, each with one `actionType` and its own config, `position` 0-based and
   contiguous. A server holds at most 25 workflows (`400 Workflow limit reached`, same order of
   magnitude as AutoMod's 50-row cap, `automod.md` → Deviations).
2. **Trigger configs**:
   - `MESSAGE_MATCHES`: `channelId` (must belong to the server), `terms: string[]` (1–20 terms, case
     insensitive substring, same shape as `AutoModRule.terms` — `automod.md` → Data model). No regex
     in v1 — **decided** (closed open question 68, see Scope → Out of scope): YAGNI, and a
     user-authored pattern is one more untrusted-input surface to validate even though `re2js`
     (already a dependency, `automod.md`) prevents catastrophic backtracking. Fires on message
     **create** only, after AutoMod screening has already run and did not block the message (a
     blocked message never reaches this trigger).
   - `WEBHOOK_RECEIVED`: no config fields; creating the workflow generates one token
     (`generateSecretToken()`), stores only its SHA-256 (`hashSecretToken()`), and returns the full
     URL (`/workflow-triggers/:workflowId/:token`) exactly once, mirroring
     `incoming-webhooks.md`'s "shown once" rule verbatim. Regenerating invalidates the old URL the
     same way.
   - `SCHEDULE`: `intervalMinutes` (60–10080, i.e. 1 hour to 7 days — no sub-hourly schedules, to keep
     the poll's relative timing error negligible). `nextRunAt` is set to `now + intervalMinutes` on
     create/enable and advanced by the same amount after each claim, so a slow tick never compounds a
     backlog of missed fires into a burst.
3. **Step configs**:
   - `POST_MESSAGE`: `channelId` (must belong to the workflow's server, must be `TEXT`), `content`
     (1–2000 chars after trimming, same cap as a webhook post — `incoming-webhooks.md` → Rules).
     Posted as the workflow's own `executorUser` (`UserKind.WORKFLOW`), through the same
     `MessagesService`/`formatMessage` path a webhook post uses, **screened by AutoMod** the same
     way (`WebhookDeliveryService.post`'s "Applied" list — `incoming-webhooks.md` → Deviations),
     **skipping** channel view/send permission, timeout, slowmode and onboarding checks (none apply
     to a synthetic author with no member row, identical reasoning to the webhook path's "Skipped"
     list). Broadcasts `message:created`/`unread:updated` exactly like a webhook post.
   - `HTTP_CALL`: `url` (http/https, ≤ 2048 chars, same `IsUrl` idiom as
     `link-preview-query.dto.ts:5`), `method` (`GET | POST`), `body?` (≤ 8 KB, sent as
     `application/json` when present — the literal trigger payload or the step's static template,
     v1 has no variable substitution, see Trade-offs), `secretHeader?: { name, value }` (optional;
     `value` is sealed with `createSecretBox` before storage and never returned by any read
     endpoint — see Technical approach → Secrets). `url`'s hostname **must be on the server's HTTP
     allowlist** (Rules item 4) both when the step is saved and again on every run — see Rules item 4
     and Edge cases.
4. **HTTP allowlist — mandatory, closed open question 67**: `HTTP_CALL` may only target a hostname a
   `MANAGE_SERVER` holder has explicitly added to that server's `WorkflowHttpAllowlistEntry` list
   (`GET`/`POST`/`DELETE /servers/:serverId/workflow-http-allowlist`). **An empty allowlist disables
   `HTTP_CALL` entirely for that server** — the default for every server, since no entry exists until
   one is added: creating or enabling an `HTTP_CALL` step is rejected
   `400 HTTP actions are disabled until an allowed host is configured` while the list is empty.
   Matching is exact-hostname, or subdomain-of when the stored entry carries an explicit leading
   `*.` (an entry for `example.com` never implicitly allows `evil.example.com`). The check runs
   twice: at save time against the URL's declared hostname (cheap, catches a typo immediately), and
   again at run time on the **resolved** hostname of the initial URL and of every redirect hop, in
   the same pass that already does DNS-pinned address-class validation (Current behavior →
   "Outbound HTTP with SSRF protection") — so neither an allowlist edit after save nor a redirect to
   an unlisted host can bypass it. Adding/removing an allowlist entry is audited
   (`WORKFLOW_HTTP_ALLOWLIST_ADD`/`_REMOVE` `{ hostname }`), and every `HTTP_CALL` execution writes
   `WORKFLOW_HTTP_CALL` `{ workflowId, host, statusCode }` to `AuditLog` with the workflow's
   `createdById` as actor — host and status only, **never** the request/response body or headers.
5. **Evaluation → run**: a matching trigger creates one `WorkflowRun` (`status: PENDING`,
   `depth` = the triggering context's depth + 1, or 0 for a real external/scheduled/message trigger,
   `causeRunId` = the run that caused it, if any) and a snapshot of the current `steps` into
   `stepSnapshot`. The run sweep (see Technical approach → Scheduling mechanism) claims it and
   executes `stepSnapshot` in order; a step's failure stops the run.
6. **Idempotency**:
   - `WEBHOOK_RECEIVED`: the caller supplies `X-Idempotency-Key` (required; missing → `400`). The
     `(workflowId, idempotencyKey)` unique constraint makes a second call with the same key a no-op
     that returns the first run's `{ runId, status }` instead of creating a second run — the write
     is `INSERT ... ON CONFLICT DO NOTHING` semantics via a `create` wrapped in a duplicate-key
     catch, never a blind insert.
   - `MESSAGE_MATCHES`: keyed on `(workflowId, messageId)` — a message is only ever created once, so
     this is naturally at-most-once; no separate idempotency key needed (message edits do not
     re-trigger, Rules item 2).
   - `SCHEDULE`: the conditional claim (`WHERE nextRunAt <= now`) is itself the dedup — a claimed row
     immediately has `nextRunAt` advanced, so a retried/slow tick cannot claim the same fire twice.
7. **Loop prevention**: every run created as a direct or indirect result of another run's
   `POST_MESSAGE`/`HTTP_CALL` step carries `depth = causeRun.depth + 1`. A run whose `depth` would
   exceed `MAX_WORKFLOW_CHAIN_DEPTH` (5) is created as `FAILED` immediately with
   `failureReason: 'CHAIN_DEPTH_EXCEEDED'` and executes no steps — this bounds A→B→A cycles and
   longer chains regardless of shape, the same way `Message.isCrosspost` bounds a one-hop republish
   loop but generalized with a counter since a workflow chain can be N workflows deep (Current
   behavior). A `POST_MESSAGE` step tags the message it creates with the run's id (see Technical
   approach) so a `MESSAGE_MATCHES` trigger elsewhere can read the cause chain; a webhook or scheduled
   trigger has no cause and is always `depth: 0`.
8. **Concurrency cap**: at most 3 `RUNNING`/`PENDING` runs per workflow at once (a 4th claim is
   skipped, retried next tick — never queued unbounded) and at most 50 `RUNNING`/`PENDING` runs per
   server at once (a new run past that cap is created `FAILED` with `RATE_LIMITED` immediately),
   bounding a burst of matching messages or webhook calls from spawning unbounded work.
9. **Disabling** a workflow stops new runs from being created; any `RUNNING` run already claimed
   finishes on its `stepSnapshot`.
10. **Deleting** a workflow cascades its steps and run history (`onDelete: Cascade`) but does **not**
    delete its `executorUser` row — **decided** (closed open question 64), mirroring
    `incoming-webhooks.md`'s precedent exactly ("Delete removes the row; the synthetic User row
    stays, so past messages keep the stored name and avatar", `incoming-webhooks.md` → Deviations).
    Any past `Message.authorId` the workflow posted keeps pointing at a live `User` row that still
    renders its stored `displayName`/`avatarUrl`; the row simply becomes detached from any
    `ChannelWorkflow` once the workflow is gone.
11. **Audit**: `WORKFLOW_CREATE`/`_UPDATE`/`_DELETE`/`_ENABLE`/`_DISABLE`
    `{ name, triggerType, stepCount }`, written the same way every other module writes
    `writeAuditLog` (Current behavior). A run firing is **not** audited per-run (that would flood
    `AuditLog` at message-trigger volume, except for `HTTP_CALL` executions, which are audited
    individually per Rules item 4 precisely because they leave the server); run history lives in
    `WorkflowRun` instead, visible only to `MANAGE_SERVER` holders.

**On the numbers above** (25 workflows/server, 1–5 steps, 60–10080 minute schedule bounds, chain
depth 5, 3/50 concurrency caps, the 5 s sweep tick used in Technical approach): these are **starting
values chosen by analogy** to this repo's existing sweeps and caps —
`ReminderSweepService`'s 15 s tick (`reminder-sweep.service.ts:18-31`), `ScheduledMessage`'s 50
pending-per-destination cap and 15 s tick (`scheduled-messages.md`), AutoMod's 50-rule/20-enabled cap
(`automod.md` → Deviations) — **not measured against real workflow traffic**, since none exists yet.
Adjust after observing production load; do not read them as tuned figures.

### Edge cases

| Case | Expected behavior |
|---|---|
| `steps` empty array | `400 Workflow needs at least one step`. |
| More than 5 steps, or a duplicate/non-contiguous `position` | `400`. |
| `MESSAGE_MATCHES` trigger's `channelId` deleted after the workflow is created | Trigger check finds no channel, treated as no-match (never throws); the workflow shows a "channel missing" badge in the list, computed at read time, not stored. |
| `WEBHOOK_RECEIVED` posted with no `X-Idempotency-Key` | `400 Idempotency key required`. |
| `WEBHOOK_RECEIVED` posted with a reused key, first run still `RUNNING` | Returns the existing run's current status (`202 { runId, status: 'RUNNING' }`), does not create a second run. |
| Unknown workflow id / token mismatch / disabled workflow on the public trigger endpoint | `404 Not found` — same reasoning as `incoming-webhooks.md`'s "never a distinct status that lets a caller fingerprint which case failed". |
| `POST_MESSAGE` step's `channelId` becomes a non-`TEXT` channel between save and run | Step fails with `INVALID_TARGET`; run `FAILED` at that step index. |
| `POST_MESSAGE` content blocked by an AutoMod `BLOCK_MESSAGE` rule | Step fails with `AUTOMOD_BLOCKED`; run `FAILED`, nothing posted, matching `scheduled-messages.md`'s identical reason code. |
| `HTTP_CALL` target resolves to a private/loopback/link-local address, or a redirect would move it there | Step fails with `BLOCKED_ADDRESS`; no request is sent to the blocked hop (validated on every redirect, like `safe-fetch.ts`). |
| `HTTP_CALL` times out, or response exceeds the byte cap | Step fails with `HTTP_TIMEOUT` / `RESPONSE_TOO_LARGE`; the response body is not stored in run history beyond the first 500 characters (see Risks — response bodies are not fully trusted content). |
| A `POST_MESSAGE` step's message itself matches another (or the same) workflow's `MESSAGE_MATCHES` trigger | A new run is created with `depth = thisRun.depth + 1`, `causeRunId = thisRun.id`; see Rules item 7 for the depth cap. |
| `HTTP_CALL` step's `url` hostname is not on the server's allowlist (or the allowlist is empty) | `400 Host not in allowlist` at save/enable time; if the allowlist changes after save so a previously-allowed host is removed, the step fails `HOST_NOT_ALLOWED` at run time instead of silently succeeding or silently skipping. |
| `HTTP_CALL` redirects from an allowlisted host to a host that is not allowlisted | Step fails `HOST_NOT_ALLOWED` at that hop; no request is sent to the disallowed host (checked before every connect, same as the address-class check). |
| Workflow disabled while a run is `PENDING` (not yet claimed) | The sweep skips `PENDING` runs whose workflow is disabled at claim time; the run is left `PENDING` indefinitely and shown as "workflow disabled" in history (not auto-cancelled, since a webhook caller may be waiting on `{ runId, status }` from the create call and expects that id to keep meaning something). |
| Two API instances race to claim the same `PENDING` run | Conditional `updateMany({ where: { status: 'PENDING' }, data: { status: 'RUNNING', claimedAt } })`; the loser's `count: 0` moves on, identical to `ScheduledMessage`'s claim (Current behavior). |
| Member without `MANAGE_SERVER` calls any workflow endpoint | `403`. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/prisma/models/workflows.prisma` (new) | `ChannelWorkflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowHttpAllowlistEntry`, the three new enums. |
| `apps/api/prisma/models/users.prisma` | `UserKind` gains `WORKFLOW`. |
| `apps/api/prisma/migrations/<new>/migration.sql` | Hand-written, additive only (new tables, one new enum value). |
| `apps/api/src/modules/workflows/workflows.module.ts` (new) | Wires the pieces below. |
| `apps/api/src/modules/workflows/workflows.controller.ts` (new) | `MANAGE_SERVER`-gated CRUD + run-history read, session auth. |
| `apps/api/src/modules/workflows/workflow-http-allowlist.controller.ts` (new) | `MANAGE_SERVER`-gated allowlist CRUD (`GET`/`POST`/`DELETE /servers/:serverId/workflow-http-allowlist`). |
| `apps/api/src/modules/workflows/workflow-http-allowlist.service.ts` (new) | Allowlist CRUD + the hostname-match function (`isAllowedHost(serverId, hostname)`) shared by save-time and run-time checks. |
| `apps/api/src/modules/workflows/workflow-trigger.controller.ts` (new) | Public `POST /workflow-triggers/:workflowId/:token`, no guard. |
| `apps/api/src/modules/workflows/workflows.service.ts` (new) | CRUD, validation (including the save-time allowlist check), token issue/regenerate, `executorUser` creation. |
| `apps/api/src/modules/workflows/workflow-trigger.service.ts` (new) | `evaluateMessage(message)` (called from `MessagesService.createMessage` after AutoMod), `receiveWebhook(workflowId, token, key, body)`. |
| `apps/api/src/modules/workflows/workflow-run-sweep.service.ts` (new) | `setInterval` claim + execute loop, mirrors `ScheduledMessageSweepService`. |
| `apps/api/src/modules/workflows/workflow-actions.ts` (new) | Pure-ish per-`actionType` executors (`postMessage`, `httpCall`), each returning a typed success/failure. |
| `apps/api/src/modules/workflows/workflow-http.ts` (new) | Wraps `safeFetchHtml`'s address-policy/DNS-pinning approach (`link-previews/address-policy.ts`, `safe-fetch.ts`) for `GET`/`POST` with a body and byte cap, no HTML parsing, plus the run-time allowlist re-check on every hop (`workflow-http-allowlist.service.ts`). |
| `apps/api/src/modules/workflows/workflow-secrets.ts` (new) | `sealSecretHeader`/`openSecretHeader` wrapping `createSecretBox(workflowSecretEncryptionKey(config))`, mirroring `two-factor-config.ts`. |
| `apps/api/src/modules/workflows/dto/create-workflow.dto.ts`, `update-workflow.dto.ts`, `dto/add-allowlist-entry.dto.ts` (new) | Trigger/step validation, one DTO per trigger/action shape (mirrors `AutoModRule`'s per-trigger fields); allowlist entry shape (`hostname`, exact or `*.`-prefixed). |
| `apps/api/src/modules/messages/messages.service.ts` | `createMessage` calls `workflowTrigger.evaluateMessage(message)` after AutoMod screening succeeds (non-blocking: a workflow evaluation failure is logged, never rejects the send). |
| `apps/api/src/common/config/*` | New `WORKFLOW_SECRET_ENCRYPTION_KEY` entry, same shape as `two-factor-config.ts`. |
| `apps/api/src/common/i18n/error-codes.ts`, locale catalogs | New error literals (see Edge cases' reason codes). |
| `apps/api/src/app.module.ts` | Register `WorkflowsModule`. |
| `packages/shared/src/workflows.ts` (new) | `WorkflowTriggerType`, `WorkflowActionType`, `WorkflowRunStatus`, per-type config types, `WorkflowView`, `WorkflowRunView`. |
| `packages/shared/src/permissions.ts` | No change — reuses `ManageServer` (see Trade-offs). |
| Web: `api.ts`, `query/queryKeys.ts`, `hooks/useWorkflows.ts`, `hooks/useWorkflowRuns.ts`, `components/settings/WorkflowsSection.tsx`, `WorkflowForm.tsx` (trigger picker, step list editor), `WorkflowRunHistory.tsx`, `ServerSettings.tsx`, `i18n/locales/{en,vi}.ts` | New settings section, gated on `MANAGE_SERVER` like `AutoModSection`. |

**API contract**

| Method | Path | Auth | Body | Response | Rate limit |
|---|---|---|---|---|---|
| `GET` | `/servers/:serverId/workflows` | session | — | `{ workflows: WorkflowView[] }` | default |
| `POST` | `/servers/:serverId/workflows` | session | `{ name, triggerType, triggerConfig, steps }` | `201 { workflow, triggerUrl? }` (`triggerUrl` only for `WEBHOOK_RECEIVED`, shown once) | 20/min |
| `PATCH` | `/workflows/:id` | session | same fields, optional, plus `enabled?` | `{ workflow }` | 20/min |
| `POST` | `/workflows/:id/regenerate-token` | session | — | `{ triggerUrl }` (only for `WEBHOOK_RECEIVED`) | 10/min |
| `DELETE` | `/workflows/:id` | session | — | `{ ok: true }` | 20/min |
| `GET` | `/workflows/:id/runs` | session | — | `{ runs: WorkflowRunView[] }` (max 50, newest first) | default |
| `GET` | `/servers/:serverId/workflow-http-allowlist` | session | — | `{ entries: Array<{ id, hostname, createdAt }> }` | default |
| `POST` | `/servers/:serverId/workflow-http-allowlist` | session | `{ hostname }` | `201 { entry }` | 20/min |
| `DELETE` | `/servers/:serverId/workflow-http-allowlist/:id` | session | — | `{ ok: true }` | 20/min |
| `POST` | `/workflow-triggers/:workflowId/:token` | none (public) | `{ payload?: object }`, header `X-Idempotency-Key` | `202 { runId, status }` | 30/min per token |

All three allowlist endpoints require `MANAGE_SERVER`, same as workflow CRUD (Current behavior);
`POST`/`DELETE` are audited per Changes → Rules item 4.

`triggerUrl` (`/workflow-triggers/:workflowId/:token`) is a path only — the web client builds the
absolute URL from `VITE_API_URL`, exactly as `incoming-webhooks.md`'s Deviations settled (no API
public base URL setting exists).

**DB / migration**

- Four new tables (`ChannelWorkflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowHttpAllowlistEntry`),
  one new `UserKind` enum value added with `ALTER TYPE ... ADD VALUE` (Postgres requires this outside
  a transaction block — the migration runs it as its own statement, same constraint
  `incoming-webhooks.md` would have hit adding `WEBHOOK`).
- No existing table is altered. Fully additive; safe to run while a previous API version still
  serves traffic (it never reads the new tables).
- `WorkflowRun.stepSnapshot` intentionally duplicates `WorkflowStep` data per run instead of joining
  — an edit must not change an in-flight run's behavior (Scope → "Editing a workflow definition takes
  effect mid-run").

**Secrets**

- `HTTP_CALL`'s `secretHeader.value` is sealed with `createSecretBox(workflowSecretEncryptionKey(config))`
  before it is written to `WorkflowStep.config`, and opened only inside `workflow-http.ts` at call
  time. `GET /servers/:serverId/workflows` and `GET /workflows/:id/runs` both strip
  `secretHeader.value` from their response (replaced with a boolean `hasSecret`), the same "write-only
  from here on" shape `incoming-webhooks.md` uses for its token.
- `WORKFLOW_SECRET_ENCRYPTION_KEY` is a new required env var in production, validated at startup the
  same way `assertTwoFactorKeyConfigured` refuses the dev default in production
  (`two-factor-config.ts:11-19`) — a new `assertWorkflowSecretKeyConfigured` follows the identical
  shape. In development it falls back to a hardcoded dev key, same as 2FA.
- Run history never stores the resolved secret header value, only whether one was sent (`true`/
  `false`).

**Libraries** — none new. Reuses `class-validator`/`class-transformer`, `RedisFixedWindowLimiter`,
`@RateLimit`, Node's `crypto`/`http`/`https`/`dns` (already dependency-free per `link-previews.md`).

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **In-process `setInterval` sweep, reusing the `ScheduledMessage`/`ReminderSweep` claim pattern (chosen)** | Zero new operational concept — this repo has no queue anywhere (`scheduled-messages.md`'s own Trade-offs already ruled out BullMQ/`@nestjs/schedule` twice); the conditional-claim `updateMany` already proven safe across instances. | Polling granularity (proposed 5 s tick, tighter than the 15 s message/reminder sweep since a `MESSAGE_MATCHES` trigger should feel near-instant) adds a small constant DB load per instance even when idle; a `SCHEDULE` trigger's fire time has the same "up to one tick late" imprecision `scheduled-messages.md` already accepts. | Chosen — introducing the repo's first message queue (BullMQ on the existing Redis) for one feature, while every other timed feature deliberately avoids it, is a bigger, cross-cutting decision than this doc's scope; flagged as the natural upgrade path if workflow volume ever needs second-level precision or true horizontal fan-out (same language `scheduled-messages.md` uses). |
| A dedicated message queue (BullMQ on the existing Redis) for run execution | Real push-based dispatch (no polling delay), built-in retry/backoff, better horizontal scaling under load. | New operational surface (a worker process or in-process worker, queue monitoring, poison-message handling) this repo has never run; Redis is already a dependency (`realtime-scale-out.md`) but not yet used as a job broker anywhere. | Ruled out for v1, same reasoning `scheduled-messages.md` already used to reject it — revisit together with that doc if load ever demands it. |
| **Generic `triggerConfig`/`config: Json` per type, validated at the DTO boundary (chosen)** | Matches `AutoModRule`'s and `ScheduledMessage.attachments`'s existing "one JSON column with per-type shape, no DB-level integrity, API-level validation" precedent; no join needed to read/execute a step. | No DB constraint can catch a config that references a channel from another server — must be checked in application code on every read and every run (same limitation `bot-message-components.md`'s `Message.components` already accepted). | Chosen — a fully relational schema per trigger/action type would need 5 extra tables for 3 triggers and 2 actions, for configs that are read-mostly and replaced wholesale on edit. |
| **`WorkflowRun.stepSnapshot` copies steps at claim time (chosen)** vs. joining live `WorkflowStep` rows at execution time | An edit mid-run cannot change what an in-flight run does — matches the acceptance criterion and avoids a step disappearing under a running executor. | Doubles storage for step configs across run history (bounded: run history is capped and old runs can be pruned later, no pruning job in v1 — see Risks). | Chosen; the alternative risks a `PATCH` racing a claimed-but-not-yet-executed run, which would need its own locking story for no benefit this feature needs. |
| **Depth counter + max chain length for loop prevention (chosen)** vs. `Message.isCrosspost`'s single-flag approach | Handles an arbitrary N-workflow cycle, not just a one-hop republish; a fixed cap (5) is simple to reason about and cheap to check (one integer compare per run creation). | A legitimately deep, intentional automation chain (rare, but conceivable) is refused past depth 5 with no per-server override in v1. | Chosen — `isCrosspost`'s one-flag trick only works because a crosspost is structurally forbidden from being republished; a workflow chain has no such single tell (A→B→A needs to look back further than one hop), so a counter is the minimal mechanism that actually bounds it. |
| **HTTP action: mandatory per-server domain allowlist, empty by default (chosen)** vs. address-class blocking only | Turns `HTTP_CALL`'s exfiltration risk from a silent capability into a visible, audited, opt-in configuration change: nothing reaches an external host until a `MANAGE_SERVER` holder names it, and every add/remove is in `AuditLog` (Changes → Rules item 4). Closes the exact gap `~/.claude/rules/security.md` names — internal data leaving the system — that address-class blocking alone cannot close, since it only stops *internal* targets, not exfiltration to any *external* one. | Defeats the "point this at any SaaS webhook URL instantly" convenience an unrestricted action would have; every new integration needs one extra step (add the host) before its first call succeeds; a server that never configures an allowlist has a fully inert `HTTP_CALL` action (acceptable — it fails closed, not open). | **Chosen** — reversing the v1 decision in this doc's first draft, which shipped address-class blocking only. A compromised or malicious `MANAGE_SERVER` holder could otherwise exfiltrate channel content to any public host in a few clicks with no visible trace beyond the workflow's own config; an allowlist entry and a per-call audit row are the visible trace this repo's security posture requires for data leaving the system. |
| Address-class blocking only, no domain allowlist (rejected) | Matches `link-previews.md`'s existing `isPublicAddress`-only precedent exactly; zero extra UI, zero extra table; any public webhook URL works immediately after saving the step. | Does not prevent a `MANAGE_SERVER` holder (or an attacker who compromised that account) from wiring server data to an attacker-controlled public URL with no configuration trail — the doc's first draft accepted this as "the feature's own requested capability"; on review that acceptance was judged insufficient for a channel that can carry every message's content. | Rejected — this was the doc's original v1 choice; superseded by the mandatory-allowlist row above after review. Kept here for the record, per this doc's own no-fork-the-doc rule. |
| Cut `HTTP_CALL` from v1 entirely, ship only `POST_MESSAGE` | Removes the exfiltration surface altogether; no allowlist UI, no secret-sealing code, no run-time redirect re-validation to build. | Removes the one action a no-code integration (Slack, Zapier, a customer's own endpoint) actually needs; `POST_MESSAGE`-only turns "channel workflows" into "scheduled/triggered messages," a materially smaller feature than requested. | Rejected as the fallback — the mandatory allowlist closes the named risk without cutting the capability, so cutting the action outright was not necessary. |
| **`WORKFLOW` as a fourth `UserKind` value with one synthetic `User` per workflow (chosen)** vs. posting through the workflow **creator's own** user id | Reuses every exclusion the repo already enforces for `WEBHOOK` (member lists, mentions, sign-in, friend requests — `incoming-webhooks.md` → Deviations) verbatim, and keeps a clear "who actually posted this" author on the message even after the creating human leaves the server. | One more `User` row per workflow (bounded: 25 workflows/server cap), one more enum value every switch on `UserKind` must handle (small, additive). | Chosen — posting as the creator would silently misattribute automated messages to a human, and would stop working the moment that human is banned/leaves, which is exactly when an automation might still need to run. |
| Posting `POST_MESSAGE` as the workflow creator's own user | No new `User` row, no new `UserKind` value. | Misattributes automated content as a human's own message; breaks (no permission) the moment the creator loses channel access, is timed out, or leaves — none of which should stop an approved automation from running. | Ruled out — couples the automation's lifetime to one human's membership, which the acceptance criteria do not want. |

What the chosen option costs overall: a second in-process timer next to `ReminderSweepService` and
`ScheduledMessageSweepService` (three near-identical polling loops in the same codebase — acceptable
today, a candidate to unify if a fourth timed feature appears), one more `UserKind` value every
existing "is this a real member" check must include, and a `Json`-typed config surface validated only
at the API boundary, matching the repo's established trade-off for AutoMod/webhooks/scheduled
messages.

## Risks & rollback

- **Risk — data exfiltration, mitigated by the mandatory allowlist**: `HTTP_CALL` still lets a
  `MANAGE_SERVER` holder send message content to an external service — that is the feature's own
  requested capability. What changed on review: the target can no longer be any arbitrary public URL
  typed into a step; it must first be added to the server's allowlist (Changes → Rules item 4), which
  is itself audited (`WORKFLOW_HTTP_ALLOWLIST_ADD`/`_REMOVE`), and every call is audited
  (`WORKFLOW_HTTP_CALL`). **Residual risk**: a `MANAGE_SERVER` holder (or an attacker who compromised
  that account) can still add an attacker-controlled host to the allowlist and then call it — the
  allowlist does not distinguish a legitimate SaaS integration from a malicious one, it only makes
  the act of pointing at a new host a visible, logged, two-step action instead of a silent one. That
  residual risk is judged acceptable because it now requires a distinguishable audit trail
  (`WORKFLOW_HTTP_ALLOWLIST_ADD`) an investigator can find, not a covert single request.
- **Risk**: `HTTP_CALL` response bodies are read and truncated to 500 characters for run history
  (mirroring AutoMod's alert-excerpt cap, `automod.md` → Deviations) but are otherwise untrusted
  content from a third party — the executor never evaluates, templates, or renders them as HTML/JS,
  only stores them as plain text.
- **Risk**: a `MESSAGE_MATCHES` trigger with broad terms plus a `POST_MESSAGE` step that itself
  matches the same trigger is the obvious self-loop; the depth cap (Rules item 7) stops it from
  running forever, but the first 5 hops still execute and post 5 messages before it is cut off —
  acceptable (bounded, visible in run history as `FAILED`/`CHAIN_DEPTH_EXCEEDED`), not silent.
- **Risk**: `WorkflowRun.stepSnapshot` means run history storage grows unboundedly with high message
  volume through a `MESSAGE_MATCHES` trigger; no pruning job exists in v1 (same gap
  `scheduled-messages.md` accepted for `SENT` rows never being cleaned up).
- **Not covered**: no per-workflow rate limit beyond the per-token `30/min` on the public trigger
  endpoint and the per-server concurrent-run cap (Rules item 8); a `MESSAGE_MATCHES` trigger watching
  a high-traffic channel has no independent throttle beyond the concurrency cap.
- **Not covered**: the allowlist has no per-entry expiry or review reminder — an entry added for a
  since-abandoned integration stays valid until a `MANAGE_SERVER` holder removes it manually; no
  periodic "unused allowlist entry" report exists in v1.
- **Rollback**: revert code; the migration is additive (four new tables, one new enum value) — no
  existing table or column changes, so reverting the migration drops only workflow data with no
  impact on anything else. `ALTER TYPE ... ADD VALUE` has no clean `DOWN` in Postgres (an enum value
  cannot be dropped); the `down` migration leaves the added `UserKind.WORKFLOW` value in place with a
  comment explaining why, same constraint any enum-extending migration in this repo would hit.

## Test plan

Not covered by automated tests, per this repo's no-test-file convention (matching every sibling doc
read for this spec). Manual scenarios:

1. **Happy path — message trigger.** Create a workflow: `MESSAGE_MATCHES` on `#general` with term
   "deploy", one `POST_MESSAGE` step targeting `#deploys` with content "Deploy detected". Post
   "deploy started" in `#general` → within one sweep tick, a message from the workflow's own author
   appears in `#deploys`; the run history shows one `SUCCEEDED` run.
2. **Happy path — webhook trigger with idempotency.** Create a `WEBHOOK_RECEIVED` workflow with a
   `POST_MESSAGE` step. `curl -X POST <triggerUrl> -H 'X-Idempotency-Key: abc' -d '{}'` → `202`, a
   message posts. Repeat the exact same call → `202` with the same `runId`, no second message.
3. **Happy path — schedule trigger.** Create a `SCHEDULE` workflow with `intervalMinutes: 60` and a
   `POST_MESSAGE` step; manually back-date `nextRunAt` to the past (DB-level, for the test only) →
   the next sweep tick claims and runs it exactly once, and `nextRunAt` advances by 60 minutes.
4. **Partial failure.** A workflow with two `POST_MESSAGE` steps, the second targeting a channel that
   is then deleted before the run fires → the first message posts, the run shows `FAILED` at step
   index 1 with `INVALID_TARGET`; the first message is not retracted.
5. **Loop.** Workflow A: `MESSAGE_MATCHES` "ping" in `#a` → `POST_MESSAGE` "ping" into `#b`. Workflow
   B: `MESSAGE_MATCHES` "ping" in `#b` → `POST_MESSAGE` "ping" into `#a`. Post "ping" in `#a` → the
   chain runs a bounded number of times (depth 0 through the cap) and the final run in the chain is
   `FAILED` with `CHAIN_DEPTH_EXCEEDED`; the server does not hang or spike CPU indefinitely.
6. **SSRF.** With the target host already allowlisted, an `HTTP_CALL` step targets
   `http://127.0.0.1:<api-port>/health` → the step fails `BLOCKED_ADDRESS`, no request is observed on
   that local port; a step targeting a public HTTPS endpoint on an allowlisted host succeeds and the
   response status is recorded.
7. **Allowlist enforcement — empty by default.** On a fresh server with no allowlist entries, try to
   save an `HTTP_CALL` step → `400 HTTP actions are disabled until an allowed host is configured`, no
   step is created. Add `api.example.com` to the allowlist, save the same step → succeeds. Remove the
   entry, then let a `SCHEDULE` workflow with that existing step fire → the run's step fails
   `HOST_NOT_ALLOWED`, no request is sent.
8. **Allowlist enforcement — redirect.** Allowlist `a.example.com` only; point an `HTTP_CALL` step at
   a URL on `a.example.com` that responds with a redirect to `b.example.com` (not allowlisted) → the
   step fails `HOST_NOT_ALLOWED` at the redirect hop; no request reaches `b.example.com`.
9. **Allowlist audit trail.** Add and then remove an allowlist entry as a `MANAGE_SERVER` holder →
   both actions appear in the server's audit log (`WORKFLOW_HTTP_ALLOWLIST_ADD`/`_REMOVE`) with the
   actor and hostname; a successful `HTTP_CALL` run appears as `WORKFLOW_HTTP_CALL` with host and
   status code only — the request body is not in the audit entry.
10. **Secret not leaked.** Create an `HTTP_CALL` step with a `secretHeader`. `GET
    /servers/:serverId/workflows` and `GET /workflows/:id/runs` → response contains `hasSecret: true`
    but no `secretHeader.value` anywhere in the payload.
11. **AutoMod interaction.** With a `KEYWORD` `BLOCK_MESSAGE` AutoMod rule active on the target
    channel, a `POST_MESSAGE` step whose content contains the blocked term → the step fails
    `AUTOMOD_BLOCKED`, nothing posts.
12. **Failure case — auth.** A member without `MANAGE_SERVER` calls
    `POST /servers/:serverId/workflows` → `403`; the same member cannot `GET .../runs` → `403`; a
    non-`MANAGE_SERVER` member cannot add an allowlist entry → `403`.
13. **Failure case — bad shape.** `POST` a workflow with 6 steps → `400`; a `WEBHOOK_RECEIVED` post
    with no `X-Idempotency-Key` → `400`.

## Deployment notes

- Run the new migration before deploying the API. It is additive except the `ALTER TYPE ... ADD
  VALUE` on `UserKind`, which Postgres requires to run outside the same transaction as other DDL —
  the migration file issues it as its own statement, as any future enum-extending migration in this
  repo must.
- **New required env var in production**: `WORKFLOW_SECRET_ENCRYPTION_KEY` (≥ 32 chars), added to
  `.env.example` with a dummy value; startup fails in production if unset or left at the dev default,
  mirroring `TWO_FACTOR_ENCRYPTION_KEY`'s existing assertion.
- New i18n keys (`workflows.*`, error-code literals) ship in both `en` and `vi` catalogs in the same
  change, per `docs/features/i18n-localization.md`.
- No cache/queue to clear — nothing is cached beyond the per-instance enabled-workflow cache (same
  15 s TTL shape as AutoMod's rule cache).
- Breaking API change: none — this is a new module with new routes.
- This repo's `docs/features/` is flat; there is no `overview.md` for a "workflows" menu today, so
  this doc doubles as the living contract until (if) a second workflows doc appears, at which point
  it should be promoted to `docs/features/workflows/overview.md` per `documentation.md`'s own rule.

## Deviations

Recorded during implementation (2026-09-29), per this doc's own rule: a mid-implementation deviation
stops, updates this section, then continues. No acceptance criterion, API contract, or DB shape
changed — both items are mechanism-only.

- **Chained-workflow depth is passed as a call parameter, not read back from a tag stored on the
  message.** The doc's Technical approach says a `POST_MESSAGE` step "tags the message it creates
  with the run's id ... so a `MESSAGE_MATCHES` trigger elsewhere can read the cause chain." That
  would need a new column on `Message`, and `apps/api/prisma/models/messages.prisma` /
  `apps/api/src/modules/messages/**` belong to a concurrent agent this wave (task brief, "Files you
  MUST NOT touch"). Implemented instead as: `WorkflowActionsService.postMessage` calls
  `WorkflowTriggerService.evaluateMessage(message, { causeRunId, depth: run.depth + 1 })` directly,
  right after it creates the message and before returning — the depth/cause context travels through
  the same call stack that created the message instead of a round-trip through a stored column.
  Every acceptance criterion in Rules item 7 (chain depth capped at `MAX_WORKFLOW_CHAIN_DEPTH`,
  `CHAIN_DEPTH_EXCEEDED` on the run that would exceed it) and the Loop scenario in Test plan hold
  identically; a `MESSAGE_MATCHES` trigger fired through `messages.service.ts`'s own send path
  (human or webhook message) still gets `depth: 0`, exactly as Rules item 7 specifies. The cost: a
  message a workflow posted carries no on-row evidence of which run produced it (no `causedByRunId`
  on `Message`) — `WorkflowRun.causeRunId`/`depth` are still the source of truth for the chain, same
  as the doc's shape, just not cross-referenced from the `Message` side. Revisit once `Message` is
  back in this feature's ownership, if a "which run posted this message" lookup is ever needed from a
  message row itself.
- **The `UserKind` enum value is added inside the same transaction as the rest of the migration's
  DDL, not as a separate pre-transaction statement.** The doc's Technical approach and Deployment
  notes both say Postgres requires `ALTER TYPE ... ADD VALUE` "outside the same transaction ... the
  migration file issues it as its own statement." That is true for PostgreSQL <12, but this repo's own
  most recent enum-extending migrations
  (`20260925001000_add_decision_channels`, `20260918007000_add_stage_channels`,
  `20260922003000_add_announcement_channels`) already established the PostgreSQL 12+ rule this repo
  actually relies on: `ADD VALUE` is allowed inside the migration's implicit transaction as long as
  the new value is not *used* before that same transaction commits — and none of those migrations'
  later statements reference the new value, exactly like this one. Matched that precedent instead of
  the doc's (more conservative, pre-12) text; the migration file's own header comment explains why.
  No behavior difference — same one-way, non-revertible `ADD VALUE` either way.

## Open questions

None open. Questions 64–68 (raised by the first draft of this doc) were reviewed and closed on
2026-09-25 — decisions folded into Changes/Trade-offs/Scope above; the closed record with each
conclusion is in `docs/features/open-questions.md` → Closed.
