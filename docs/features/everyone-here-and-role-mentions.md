# Everyone / Here / Role Mentions

- **Status**: draft — awaiting review
- **Date**: 2026-09-29
- **Related**: `docs/features/dm-push-notifications.md` (push fan-out pattern this reuses), `docs/features/performance-optimization.md` (batch permission evaluation, `:147`), `docs/features/member-timeout-and-slowmode.md`, `docs/features/age-restricted-channels.md`, `docs/features/automod.md`, `docs/features/timed-notification-mute.md`

## Goal

Mention parsing today is one regex that only ever matches a real username: `parseMentions` (`apps/api/src/modules/messages/messages.service.ts:813-815`) is `[...content.matchAll(/@([a-zA-Z0-9_]+)/g)].map((match) => match[1])`, called from `notifyMentionedUsers` (`:748`) and resolved by `prisma.user.findMany({ where: { username: { in: mentionedUsernames, mode: 'insensitive' }, ... } })` (`:750-756`). Typing `@everyone`, `@here`, or `@moderators` (a role name) parses `"everyone"` / `"here"` / `"moderators"` as a candidate **username**, finds no matching user, and silently notifies nobody — indistinguishable from a typo. The `MentionEveryone` permission (`packages/shared/src/permissions.ts:15`, `MENTION_EVERYONE`) is declared and granted to built-in roles (`apps/api/src/modules/servers/server-template-builtins.ts:27`) but is read nowhere in `apps/api/src` (confirmed: `grep -rn "MENTION_EVERYONE\|MentionEveryone" apps/api/src` returns only its declaration site) — it is dead data today.

This doc designs real `@everyone`, `@here`, and role-name mentions: who gets notified, how the fan-out is bounded on a large server, and where `MentionEveryone` is finally enforced.

**Acceptance criteria**:

- [ ] `@everyone` in a message sent by a member holding `MentionEveryone` on that channel's server notifies (push + unread-mention badge) every member who can `ViewChannel` there, without a full-table scan blocking the request on a large server.
- [ ] `@here` notifies the same set, filtered to members whose `User.status` is `ONLINE`.
- [ ] `@<role name>` (single-word role name, case-insensitive, matching the existing username-lookup convention) notifies every member currently holding that role who can `ViewChannel`.
- [ ] A member without `MentionEveryone` who sends `@everyone`, `@here`, or a role mention gets a `403` before the message is persisted — the message is never created as plain text.
- [ ] `@everyone`/`@here` cannot be shadowed by a user registering that exact username, and cannot be produced by a role rename (both already structurally guarded, see Current behavior).
- [ ] `notifyMentionedUsers`'s single-username push path and `RealtimeUnreadService`'s unread-badge mention count agree on what counts as a mention — today they are two independent regexes and would silently diverge if only one were updated.

## Scope

**In scope**

- Extending mention parsing (used by both push and unread-badge paths) to recognize `@everyone`, `@here`, and `@<role name>` alongside the existing `@<username>`.
- Enforcing `MentionEveryone` on send, for every top-level message-creation path that already calls `notifyMentionedUsers` today: `MessagesService.createMessage` (channel send, `:275`), `MessagesService.createThreadReply` (`:396`), `ForumPostsService.createPost` (`forum-posts.service.ts:153`), `DecisionsService.createDecision` (`decisions.service.ts:165`), `WebhookDeliveryService.post` (`webhook-delivery.service.ts:109`).
- Bounding the fan-out for `@everyone`/`@here` on a large server: batched queries instead of one Prisma round trip per recipient.
- Web: highlighting `@everyone`/`@here`/role mentions distinctly from a resolved user mention, and the new i18n catalog keys for the new permission-denied error.
- A `Role.isMentionable` boolean, defaulting to `true`, so a role admin can opt a role out of being pinged (parity with the read-only members it already protects via `ManageRoles`-gated edits).

**Out of scope**

- **Switching to id-based mention tokens** (`<@userId>` / `<@&roleId>`, the way Discord's own client composes them) instead of plain-text `@name`. This is the central trade-off below; the recommendation is to stay plain-text for this change. Building a composer autocomplete (there is none today — grepped `apps/web/src` for `mention` and `autocomplete`; no mention-suggestion component exists) is a separate, larger web task.
- **Message edit**: `MessagesService.updateMessage` (`:410-451`) never calls `notifyMentionedUsers` today — an edited message has never triggered a mention notification, keyword or username. This doc does not add that (it would be new notification behavior, not a fix to existing behavior); it only makes sure `updateMessage`'s `enforceAutoMod` call is not mistaken for a mention gate. Left as a named gap below (see Risks).
- **Announcement crosspost** (`apps/api/src/modules/announcements/publish.service.ts:216-234`): deliberately does not call `notifyMentionedUsers` today, with the comment "a name mentioned in the source server may be a different person here" (`:230-231`). `@everyone`/`@here`/role mentions inherit that same exclusion — a crosspost's `@everyone` would mean "everyone in the *source* server," not the follower's, so it stays unresolved plain text in the copy, same as a username mention is today.
- **Scheduled messages**: `ScheduledMessageSweepService.send` (`scheduled-message-sweep.service.ts:206`) calls `MessagesService.createMessage` directly, so it already goes through the same gate this doc adds — no separate change needed there.
- **Direct messages**: `DirectMessagesService` has no mention parsing at all today (grepped `direct-messages.service.ts` for `Mention`/`parseMentions` — no match) and DMs have no server/role concept to resolve `@everyone`/`@here`/role against. Not addressed here.
- **Bots posting via the bot API**: not traced in this doc; if a bot message ever reaches `MessagesService.createMessage`/`enforceAutoMod`-style paths it inherits the same gate as any other author id, but bot-specific permission grants were not read.
- Backfilling `Role.isMentionable` semantics onto existing mention behavior for plain usernames — a plain `@username` mention is unaffected by this flag.

## Current behavior

- `parseMentions` (`messages.service.ts:813-815`): `/@([a-zA-Z0-9_]+)/g`, no distinction between a keyword, a role, or a username.
- `notifyMentionedUsers` (`messages.service.ts:738-770`): dedupes the matched tokens, looks up real `User` rows by username (`:750-756`), then per matched user checks `ViewChannel` (`:759-764`) and calls `PushService.sendMentionPush` (`:768-776`). No in-app `Notification` row is created for a channel mention today (grepped `notifications.create`/`NotificationsService` under `apps/api/src/modules/messages/` and `forum/` and `decisions/` — no match); only a push is sent. Only direct messages create an in-app `Notification` row (`direct-messages.service.ts:168-180`, per `dm-push-notifications.md`).
- `RealtimeUnreadService` has its **own**, separate mention regex: `messageMentionsUsername` (`realtime-unread.service.ts:12-15`), also `/@([a-zA-Z0-9_]+)/g`, matched case-insensitively against each viewer's own username, used to set `mentions: 1` on the `unread:updated` payload (`:72`). This is a second, independent implementation of "does this content mention this recipient" that must change in lockstep with `parseMentions`, or push and the unread-mention badge will disagree about what counts as a mention.
- `PushService.sendMentionPush` (`push.service.ts:81-111`): skips self-mentions, calls `shouldSendPush(toUserId, serverId, channelId)` (mute/online/desktop gating, `:170-194`, reused unchanged by this doc), loads that one user's `PushSubscription` rows, applies a per-`(userId, channelId)` throttle (`reserveRateLimit`, `:263-`, one row per pair, one push per window regardless of how many separate mentions land in it), then delivers.
- `MentionEveryone` (`packages/shared/src/permissions.ts:15`, `MENTION_EVERYONE`) is in `ownerPermissions` (implicitly, via `Object.values(Permissions)`) but **not** in `defaultMemberPermissions` (`permissions.ts:24-30`) — it is meant to be a granted-not-default permission, and is granted to the built-in `Admin`/`Moderator` templates (`server-template-builtins.ts:27`), but no code path reads it (confirmed by grep across `apps/api/src`).
- `PermissionsService.requireServerPermission` / `hasServerPermission` (`permissions.service.ts:33-60`) are the existing pattern for a server-level permission gate: owner bypasses, otherwise checked against the member's role grants. `PermissionsService.filterMembersWhoCanView` (`permissions.service.ts:179-194`) already batch-loads a channel's permission overrides once and evaluates every candidate member in memory — the exact pattern this doc's `@everyone`/`@here` fan-out reuses, and the one `performance-optimization.md:147` already committed to ("batch-load members / roles / overrides per request and evaluate in memory").
- There is already a real, permission-model `Role` named literally `'@everyone'` per server (`EVERYONE_ROLE_NAME = '@everyone'`, `server-template.rules.ts:25`): every server's base role, granted to every member at bootstrap (`server-bootstrap.ts:52-79`) and on join via invite (`servers.service.ts:390-403`). It cannot be renamed, have its permissions edited, or be removed — `RolesService.findMutableRole` and `removeMemberRole` both throw `'Cannot mutate @everyone role'` / `'Cannot remove @everyone role'` the moment `role.name === '@everyone'` (`roles.service.ts:128-129, 159-160`). `Role.name` is unique per `(serverId, name)` (`servers.prisma:148` `@@unique([serverId, name])`), so no other role can ever collide with this name.
- `Role` (`apps/api/prisma/models/servers.prisma:138-149`) has `id, serverId, name, color, position, permissions: String[]` — **no `isMentionable` column** (verified by reading the full model).
- `User.status` (`apps/api/prisma/models/users.prisma:46`, `enum UserStatus { ONLINE, OFFLINE, IDLE, DND, INVISIBLE }`, default `OFFLINE`) is the only presence signal read anywhere in the push path (`PushService.isPushAllowed`/`shouldSendPush` both check `status === 'ONLINE'`, `push.service.ts:170-194, 156-163`) — this doc reuses it as-is for `@here`'s "currently online" definition; there is no separate presence/session table.
- `RegisterDto.username` (`apps/api/src/modules/auth/dto/register.dto.ts:9-13`) allows any `[a-zA-Z0-9_.-]+`, 3–32 chars — no reserved-word blocklist exists; nothing stops a user from registering the username `everyone` or `here` today.
- The web markdown renderer already highlights **any** `@word`-shaped token as a `mention` node, resolved or not: `INLINE_PATTERN` in `apps/web/src/utils/markdown.ts:29` includes `(@[\w.-]+)`, captured into `{ type: 'mention', value }` (`markdown.ts:8, 121`) and rendered as a styled `<span>` with no resolution against real users/roles (`MarkdownContent.tsx:74-75`). It does not distinguish a real user mention from an unresolved word, let alone from `@everyone`/`@here`/a role.
- No mention-autocomplete UI exists anywhere in `apps/web/src` (grepped `mention` case-insensitively — no suggestion/autocomplete component; the composer is plain-text).
- `ERROR_MESSAGE_CODES` (`apps/api/src/common/i18n/error-codes.ts`) is generated from thrown English literals and checked, not authored freely, by `scripts/i18n-scan.mjs`'s `checkErrorCodeMap` (`:157-186`): every mapped literal must still be thrown somewhere in `apps/api/src`, or `i18n:check` fails.

## Changes

### Rules / Flow

1. **Shared mention parser.** Add one function, e.g. `parseMentionTokens(content: string): MentionToken[]` returning a discriminated union `{ kind: 'everyone' } | { kind: 'here' } | { kind: 'role'; name: string } | { kind: 'user'; username: string }`, in a new file `apps/api/src/modules/messages/mentions.ts` (or beside `message.format.ts`, matching the module's existing file-per-concern layout, `code-style.md`). Resolution order for each matched `@token`, decided once so it is never re-litigated per call site:
   - Literal `everyone` (case-insensitive) → `kind: 'everyone'`.
   - Literal `here` (case-insensitive) → `kind: 'here'`.
   - Otherwise, matched against `Role.name` for the message's server (case-insensitive, single-word only — see Trade-offs) → `kind: 'role'`.
   - Otherwise → `kind: 'user'` (today's behavior, unchanged: resolved by username lookup, non-match notifies nobody).
   - A token that happens to match *both* a role name and a username (e.g. a role literally named `moderators` and a user named `moderators`) resolves as a **role** — roles are checked first because `Role.name` is unique per server and a name collision with a username is the rarer, more deliberate case (a role admin picked that name on purpose); flagged in Edge cases and `open-questions.md` is not touched (see report) since it is a genuine judgment call.
2. **`notifyMentionedUsers` fans out per token kind**, keeping its existing per-mentioned-user push call for `kind: 'user'` unchanged, and adding:
   - `kind: 'everyone'` → recipients = every server member who can `ViewChannel` on this channel (reuses `PermissionsService.filterMembersWhoCanView`, already batch-loading overrides once — Technical approach spells out the query shape for a large member list).
   - `kind: 'here'` → same recipient set, filtered to `User.status === 'ONLINE'`.
   - `kind: 'role'` → same recipient set, filtered to members holding that `Role` (`MemberRole` join), and further filtered to `role.isMentionable` (new column, default `true` — see Technical approach) unless the sender holds `MentionEveryone` (an admin's `@role` still reaches an explicitly-unmentionable role, matching the read-only precedent in `server-onboarding.rules.ts:16-19` where `@everyone` is exempted from a different rule for the same "the base role is special" reason).
   - Self-mention exclusion (`sendMentionPush`'s existing `toUserId === fromUserId` check, `push.service.ts:82`) still applies per-recipient.
3. **`MentionEveryone` enforcement happens before the message is persisted**, not inside `notifyMentionedUsers` (which already runs *after* `prisma.message.create`, e.g. `messages.service.ts:264` then `:275`) — a denied send must never create the message row. Add `MessagesService.requireMentionPermission(userId, serverId, content)`:
   - Parses tokens with `parseMentionTokens`.
   - If any token is `kind: 'everyone'` or `kind: 'here'`, or `kind: 'role'`, `requireServerPermission(userId, serverId, Permission.MentionEveryone)` (throws `403` via the existing `ForbiddenException` pattern, `permissions.service.ts:33-46`, message: a new literal, e.g. `'Missing permission to mention everyone, here, or a role'` — reuses the exact wording style `requireServerPermission` already throws, `:44`, so it flows through the same generic-permission-denied error code rather than inventing a bespoke one).
   - Called at each of the five write paths listed in Scope, at the same point `enforceAutoMod` is already called (right after `content = dto.content.trim()`, before `prisma.message.create`) — this mirrors `enforceAutoMod`'s existing "checked once per path, right before persisting" placement exactly (`messages.service.ts:248-253`, `forum-posts.service.ts` and `decisions.service.ts` call sites, `webhook-delivery.service.ts:77-83`).
   - A `kind: 'user'` token never requires this permission — plain mentions are unaffected.
4. **Webhook-authored messages** (`WebhookDeliveryService.post`) call `requireMentionPermission(webhook.webhookUserId, ...)` the same way. A webhook's synthetic author has no `ServerMember` row created for it by `webhookUserIdentity()` (confirmed: `webhooks.service.ts` never creates a `ServerMember`/`MemberRole` for the webhook's `User`) — `requireServerPermission` throws `ForbiddenException('You are not a member of this server')` (`permissions.service.ts:26-28`) for *any* server permission check on a non-member, so a webhook message containing `@everyone`/`@here`/a role name is refused today's-equivalent way: it fails closed, consistent with a webhook already being unable to hold any other server permission.
5. **`Role.isMentionable`** (new `Boolean @default(true)` column): editable via the existing role-update endpoint, gated the same way every other role field already is (`RolesService.findMutableRole` blocks it for the `@everyone` role, same as every other field — `@everyone` stays always-mentionable via the `kind: 'everyone'` keyword path regardless, so this flag never needs to apply to it).
6. **Unread-mention badge parity**: `RealtimeUnreadService.messageMentionsUsername` (`:12-15`) and its caller `listUnreadRecipients` (`:47-70`) are rewritten to call the same shared `parseMentionTokens`, so a viewer's unread badge lights up for `@everyone`/`@here`/their role exactly when they would also receive a push for it — same recipient-set logic, reused rather than re-derived (`viewers` is already the batch-permission-checked member list at `:65`, `filterMembersWhoCanView`).

### Edge cases

| Case | Expected behavior |
|---|---|
| Sender lacks `MentionEveryone`, types `@everyone` | `403` before the message is created; the client never sees a "sent as plain text" fallback (see Trade-offs for why refuse-over-degrade was chosen). |
| A member is literally named `everyone` or `here` | Never reachable as a mention target: `kind: 'everyone'`/`kind: 'here'` always wins over `kind: 'user'` resolution (Rules item 1). `RegisterDto.username` gains a reserved-word check (`everyone`, `here`, case-insensitive) going forward; an **existing** user already registered under one of these names (none exist in this codebase's fixtures, not verified against a real database) keeps their account and username, but becomes permanently unmentionable-by-username — a deliberate, named trade-off, not silently accepted (see Risks). |
| A role name collides with a username | Role wins (Rules item 1); the user is still mentionable by exact-case username via other UI (profile links), just not via `@name` in a message while that role name exists. |
| Role name contains a space (`"core team"`) | Not mentionable via `@core team` in v1 — the parser only matches `@[\w.-]+` (no spaces); documented as a known limitation of staying plain-text, not fixed here (Trade-offs). |
| `role.isMentionable = false` | No push/unread bump for that role's members from a `@role` token; the sender still needs `MentionEveryone` to attempt it in the first place (the permission gate and the mentionable flag are independent checks — a member could hold `MentionEveryone` and still ping an unmentionable role's members if the flag were bypassed only for them, which Rules item 2 explicitly allows, matching Discord's own "an admin can still @ a locked role" behavior). |
| `@everyone` on a 10,000-member server | Bounded by batched queries, not a 10k-row loop of individual round trips (Technical approach → fan-out). |
| Duplicate tokens (`@everyone @everyone`) | Deduped exactly like today's username dedup (`new Set(...)`, `:748`) — one notification per recipient regardless of repeat count. |
| Empty / no mentions | No-op, unchanged (`if (!mentionedUsernames.length) return`, generalized to the new token list). |
| Editing a message to add `@everyone` | Out of scope (Scope) — `updateMessage` does not call the mention pipeline at all today; no permission check or notification fires on edit, same as a plain `@username` edit today. Flagged as a pre-existing, now slightly more visible gap in Risks. |
| Sender is timed out / channel is slowmode-throttled / age-restricted | Unaffected — `requireNotTimedOut`, slowmode, and `isAgeRestricted`'s content-free push body (`push.service.ts:100-102`) all already run independently of mention parsing and continue to gate the same way; an `@everyone` push to an age-restricted channel still carries no author/content, same as any other mention push there. |
| AutoMod | `enforceAutoMod` still runs on the same `content` and can still block the send outright (its own `BadRequestException`, unrelated to `MentionEveryone`); order between the two checks does not change behavior since both must pass — this doc places `requireMentionPermission` immediately before `enforceAutoMod` at each call site (permission is cheaper to check and is the more specific gate). |
| Muted server/channel/global (`NotificationPreference`) | Unaffected — every per-recipient push still runs through the existing `shouldSendPush` (mute/online/desktop) exactly as a single-user mention does today; `@everyone` does not bypass a recipient's own mute. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/src/modules/messages/mentions.ts` (new) | `parseMentionTokens`, shared by push and unread-badge paths. |
| `apps/api/src/modules/messages/messages.service.ts` | `notifyMentionedUsers` fans out per token kind; new `requireMentionPermission`; call it from `createMessage` (`:275`) and `createThreadReply` (`:396`), before `enforceAutoMod`. |
| `apps/api/src/modules/forum/forum-posts.service.ts` | Call `this.messages.requireMentionPermission(...)` before its own `enforceAutoMod` call. |
| `apps/api/src/modules/decisions/decisions.service.ts` | Same. |
| `apps/api/src/modules/webhooks/webhook-delivery.service.ts` | Same, using `webhook.webhookUserId`. |
| `apps/api/src/modules/realtime/realtime-unread.service.ts` | `messageMentionsUsername` replaced by a call into the shared `parseMentionTokens` + the same role/everyone/here resolution `notifyMentionedUsers` uses. |
| `apps/api/src/modules/permissions/permissions.service.ts` | No change to existing methods; `requireServerPermission` is reused as-is for the `MentionEveryone` gate. |
| `apps/api/prisma/models/servers.prisma` | `Role.isMentionable Boolean @default(true)`. |
| `apps/api/src/common/i18n/locales/en.ts`, `vi.ts` | New push/error copy keys (see below). |
| `apps/api/src/common/i18n/error-codes.ts` | New entry for the thrown `MentionEveryone`-denied literal, added by hand and confirmed by `npm run i18n:check` (per the file's own generation comment). |
| `apps/web/src/utils/markdown.ts` | `mention` node gains a `kind` (`'everyone' | 'here' | 'role' | 'user'`) so the renderer can style them differently; parsing stays a client-side regex mirror of the server's token shape (everyone/here keywords + `@word`), it does not resolve against real role data (no round trip from the renderer — see Trade-offs). |
| `apps/web/src/components/chat/MarkdownContent.tsx` | Render `everyone`/`here`/`role` mentions with a distinct highlight class from a resolved `user` mention. |
| `apps/web/src/i18n/locales/{en,vi}/*.ts` | New catalog keys for the permission-denied toast, if the composer surfaces one client-side before submit (optional — see Trade-offs on refuse-at-submit vs. no client-side check at all). |

**API contract**

No new endpoint. Existing send endpoints (`POST /channels/:channelId/messages`, the thread-reply equivalent, forum post create, decision create, webhook execute) gain one new failure mode:

- `403` — `MentionEveryone` required, thrown by `requireMentionPermission`, mapped through the existing generic `ForbiddenException` → i18n error-code pipeline (no new HTTP status, no response-shape change).

`Role` update endpoint (`PATCH /servers/:serverId/roles/:roleId`, existing `RolesService` — not re-verified line-by-line here since its DTO shape was not read) gains an optional `isMentionable: boolean` field, additive, defaulting to `true` server-side when omitted.

**DB / migration**

- `Role.isMentionable Boolean @default(true)` on the existing `Role` table (`apps/api/prisma/models/servers.prisma:138-149`). Additive, non-null with a `DEFAULT`, no backfill needed, no lock concern (`Role` rows are per-server, small).
- Migration file: hand-written, `up()` adds the column with the default; `down()` drops it. No data-destroying `down()`.
- No new table for `@everyone`/`@here` fan-out — see Trade-offs for why a job/queue table is not introduced.

**Fan-out bound for `@everyone` / `@here`** (the central scaling question):

- Today's `notifyMentionedUsers` does one `hasChannelPermission` call *per matched user* (`:759-764`), each of which internally loads that channel's overrides again unless already cached — fine for a handful of `@username` mentions, not for thousands of members.
- This doc requires the `@everyone`/`@here`/`@role` path to load the channel's permission overrides **once** (`PermissionsService.filterMembersWhoCanView`, already batch-loading, `permissions.service.ts:179-194`) and evaluate every candidate member in memory, exactly the pattern `performance-optimization.md:147` already committed the repo to for other member-list operations.
- Recipient loading itself must be a single `prisma.serverMember.findMany({ where: { serverId }, include: { user: { select: { id, username, status } }, roles: { include: { role: true } } } })` — one query, not one query per candidate — mirroring `RealtimeUnreadService.listUnreadRecipients`'s existing shape (`:56-63`).
- Per-recipient work after that (push subscription lookup, throttle check, push delivery) is unavoidable per Discord-parity semantics (each recipient's mute/online state and push subscriptions differ) but each of those three steps is already batchable across recipients as one `findMany` per step instead of per recipient — `PushService.sendMentionPush`'s current one-row-at-a-time shape (`:81-111`) does not batch this today even for the existing single-username case, and this doc does **not** rewrite `PushService` to batch across recipients (a materially larger change to a module the doc's Scope does not otherwise touch). Recorded as a known cost below, not solved here — see Risks.
- No cap on member count in v1: a message land on a 10k-member server produces up to 10k push attempts and up to 10k `unread:updated` socket emits, same order of magnitude as any other server-wide event this repo already emits per member (e.g. presence). If this proves too slow in practice, the fix is moving `notifyMentionedUsers`'s `@everyone`/`@here` branch onto a queue — not designed here (see Trade-offs, Option C) because the repo has no queue infrastructure today (confirmed absent, `dm-push-notifications.md` Trade-offs B).

**Libraries** — none new.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): plain-text `@everyone` / `@here` / `@<role-name>` keywords, resolved server-side at send time, same regex family as today** | Zero client changes required to *produce* a working mention (no composer/autocomplete work); consistent with every other mention/markdown token in this repo already being plain text (`@username`, `:emoji:`, custom stickers by name); smallest diff. | Ambiguous with a username or role name that happens to collide (mitigated in Rules item 1); a role name with a space is never mentionable (documented limitation); renaming a role invalidates old messages' mention *semantics* retroactively if reparsed (in practice mentions are resolved once, at send time, not on every render, so this only matters for the live send, not history). | Chosen — the repo has no mention-autocomplete UI today (verified absent), so an id-based token (`<@userId>`, `<@&roleId>`) could only be *produced* by hand-typing a raw id, which no real user would do; id-based tokens only pay off once a composer can insert them, which is out of scope here. |
| B: switch to Discord-style id-based tokens (`<@userId>`, `<@&roleId>`, plus a literal `@everyone`/`@here` keyword) rendered by the client into a friendly name | No name-collision ambiguity ever; a role rename or a user rename does not break old messages' resolution; the definitive fix for the ambiguity this doc otherwise has to reason about case-by-case. | Requires building composer autocomplete (member/role search-as-you-type) that does not exist at all today — a full web feature, not a parsing change; every existing stored `Message.content` stays plain-text forever (no backfill of history — old messages keep rendering `@username` as today, a permanent two-format world unless a migration script rewrites content, which touches user-authored data and is its own risk); a bigger, separable piece of work. | Rejected for **this** doc — recommended as the real end-state, but scoped as a distinct follow-up once (or if) an autocomplete composer is built. Migration cost if adopted later: existing `Message.content` rows are never rewritten; the renderer must support both a bare `@word` (legacy) and `<@id>`/`<@&id>` (new) indefinitely, or a one-time content-rewrite script is run — not designed here. |
| C: push `@everyone`/`@here` fan-out onto a background job/queue instead of the in-request `Promise` fan-out every other mention already uses | Decouples a 10k-recipient fan-out from the sender's request latency; natural place to add batching/backoff later. | No queue/job infrastructure exists in this repo today (`dm-push-notifications.md` Trade-offs, Option B, confirmed again while writing this doc); disproportionate infrastructure addition for one message type. | Rejected for v1, same reasoning `dm-push-notifications.md` already used for DM push — revisit if real server sizes make the in-request fan-out measurably slow. |
| D: silently downgrade an unauthorized `@everyone` to plain text instead of refusing the send | Sender's message still goes through; no new `403` to handle client-side. | Silently changes what the sender typed without telling them — the word `@everyone` still literally appears in the stored, delivered message, misleading every reader into thinking it *did* notify everyone when it did not; worse UX than a clear refusal, and inconsistent with how every other permission gate in this repo already works (`enforceAutoMod`, `requireNotTimedOut`, slowmode — all refuse, none silently rewrite content). | Rejected — refuse-before-persist (chosen, Rules item 3) matches the repo's existing gate style everywhere else. |

What the chosen option (A) costs: an extra `Role`/`MemberRole` lookup per send whose content contains an `@token` (cheap, same shape as the existing username lookup); a genuinely unresolved ambiguity between a role name and a username that this doc breaks by fiat (role wins) rather than eliminating; no fix for role names containing spaces; the id-based "real fix" (Option B) is deferred, not delivered.

## Risks & rollback

- **What can break**: a server with thousands of members sending `@everyone` in a busy channel produces a burst of Prisma queries and push HTTP calls in one request (Technical approach → fan-out bound); this doc bounds the *query count* (one batch load, not N) but does not add a hard recipient cap or move the work off the request path — a genuinely huge server could still make that one request slow. Mitigation if this becomes real: Option C (queue), not implemented now.
- **Not covered**: id-based mention tokens (Option B); mentions on message edit (Scope); role names with spaces; per-role-mention rate limiting beyond the existing per-`(userId, channelId)` push throttle, which already caps repeat pushes to the same recipient regardless of mention kind.
- **A pre-existing user registered as `everyone` or `here`** (if any exists in a real database — not checked here, out of reach without DB access) permanently loses username-mentionability the moment this ships; flagged, not fixed retroactively (no rename-on-deploy script proposed — renaming a user's identity is a decision for the user, not this doc).
- **Rollback**: revert the code; the only schema change is the additive `Role.isMentionable` column, dropped by the migration's `down()` — no data loss beyond the column itself (its values, if any were set to `false`, are lost on rollback, which is inherent to dropping a column and is stated here per `rules/database.md`).

## Test plan

Not covered by automated tests (repo has no test suite — confirmed, no `test` script in `package.json` or `apps/api/package.json`, matching this repo's documented policy).

**Manual**

1. A member without `MentionEveryone` sends `@everyone` in a `TEXT` channel → request returns `403`, no message is created, no push fires.
2. A member holding `MentionEveryone` (e.g. the built-in `Admin` role) sends `@everyone` in a channel with 5 members who can `ViewChannel` → all 4 other members (excluding the sender) receive a push (those offline / not muted) and their unread badge shows a mention for that channel; a 6th member without `ViewChannel` on that specific channel (an override) receives nothing.
3. Same setup, `@here` → only members with `User.status = 'ONLINE'` are excluded from push (push is only sent to non-`ONLINE` recipients per existing `shouldSendPush`, so verify the *unread badge* — which is not gated by online status — only bumps for members who are currently online, the inverse of the push gate; confirm this distinction does not produce a contradictory UI state).
4. Sender holding `MentionEveryone` sends `@moderators` where a role named `moderators` exists → only members holding that role, who can also `ViewChannel`, are notified.
5. Set `Role.isMentionable = false` on `moderators`, repeat step 4 with a sender who does **not** hold `MentionEveryone` (should still be `403`, since the permission check runs first) and with a sender who **does** hold it (per Rules item 2, still reaches the role's members — confirm this is the intended behavior before shipping, since it is a judgment call, not a hard requirement).
6. Register a new user with username `everyone` → registration is refused (reserved word) once the `RegisterDto` check ships; confirm the existing `everyone`-role and `here`-keyword paths are unaffected either way.
7. Sender sends `@everyone` in an age-restricted channel → recipients' push bodies stay content-free (existing `isAgeRestricted` behavior, unchanged), unread badges still bump normally.
8. Sender edits a message to add `@everyone` after it was sent → no new notification fires (Scope: edit path untouched), matching today's behavior for a plain `@username` added via edit.
9. Webhook execution containing `@everyone` → refused (`403`-equivalent for the webhook execute endpoint), since the webhook's synthetic user is never a `ServerMember` and so never holds `MentionEveryone`.

## Deviations

Found during implementation, not re-litigating the design above — recorded here per `AGENTS.md` §1b.

- **`apps/api/src/modules/permissions/channel-permission.ts`'s local `Permission` const (re-exported
  by `PermissionsService`) did not actually contain `MentionEveryone`** — it is a hand-maintained
  mirror of `packages/shared/src/permissions.ts`'s `Permissions` object and was already missing both
  `MentionEveryone` and `DeafenMembers` before this change (confirmed by reading the file). The Goal
  section's claim that `MENTION_EVERYONE` "is declared... but read nowhere" was accurate for the
  *shared* enum, but `requireServerPermission(userId, serverId, Permission.MentionEveryone)` could
  not even type-check against the *local* one. Added `MentionEveryone: 'MENTION_EVERYONE'` to that
  local const (additive, one line) so the gate in Rules item 3 compiles and works. `DeafenMembers`'s
  absence is unrelated to this task and left as-is — flagged in the hand-back, not fixed here.
- **`parseMentionTokens`'s actual signature is `(content: string, roleNames: readonly string[])`**,
  not `(content: string)` as written in Rules item 1. Resolving a `@token` against `Role.name`
  requires knowing the server's role names; a content-only parse cannot know that, so the caller
  (`requireMentionPermission`, `notifyMentionedUsers`) loads the server's `Role.name` list once and
  passes it in. The realtime-unread parity item (below) could not be wired the same way because
  that file is outside this change's ownership.
- **`RealtimeUnreadService.messageMentionsUsername` (`apps/api/src/modules/realtime/realtime-unread.service.ts:12-15`)
  was NOT replaced** with the shared `parseMentionTokens`, and **`RealtimeUnreadService.listUnreadRecipients`
  was not touched** — both are inside `apps/api/src/modules/realtime/**`, explicitly outside this
  change's file ownership this wave (owned by another agent building a new eviction service there).
  **This means acceptance criterion 6 ("the push path and the unread-badge path agree on what counts
  as a mention") is not met**: the unread badge still lights up only for a plain `@username` match
  and never for `@everyone`, `@here`, or a `@role` mention, while the push path (this change) now
  covers all four.

  **Closed afterwards.** The file-ownership split that caused this was a planning choice, not a
  design one, so the gap was closed directly rather than left for a later wave.
  `messageMentionsUsername` is gone; `listUnreadRecipients` now loads the server's `Role.name` list
  alongside the members query and calls `resolveMentionTargets` → `parseMentionTokens`, so both
  paths resolve `@everyone`, `@here`, `@role` and `@username` through the one parser. The members
  query also selects `user.status`, which is what separates `@here` from `@everyone`. `mentions`
  stays 0-or-1: the badge answers "does this message mention me", not how many ways it does.
  Acceptance criterion 6 is met.
- **`DecisionsService.createDecision`** was initially NOT updated, because
  `apps/api/src/modules/decisions/**` sat outside that wave's file ownership, leaving a member
  without `MentionEveryone` able to type `@everyone`/`@here`/a role name in a decision proposal
  unrefused. **Closed afterwards**: the ownership split was a planning choice, not a design one.
  `createDecision` now calls `requireMentionPermission(userId, channel.serverId, `${title} ${content}`)`
  right before `enforceAutoMod`, screening the title with the body so the permission cannot be
  dodged by putting the mention in the title — the same shape `ForumPostsService.createPost` uses.
  The companion half is closed too: `notifyMentionedUsers`'s `isPrivate` parameter is **required**
  again rather than optional-and-permissive, and `createDecision` passes `channel.isPrivate` (the
  channel object `requireCanPostInDecision` already returns). All five write paths now enforce it.

- **Web mention highlighting distinguishes only `everyone`/`here` from a resolved user mention, not
  a role mention** — `apps/web/src/utils/markdown.ts`'s client-side parser has no access to the
  server's role list (Trade-offs: "it does not resolve against real role data, no round trip from
  the renderer"), so a `@role-name` token renders with the same styling as a plain unresolved
  username, exactly as it does today. This matches the Trade-offs section's own stated limitation;
  called out here because the acceptance criterion's wording ("highlighting... role mentions
  distinctly") is only partly satisfied by the shipped renderer.
- No new i18n keys were added for the `MentionEveryone`-denied error. `requireMentionPermission`
  throws through `PermissionsService.requireServerPermission`'s existing generic message
  (`` `Missing permission: ${permission}` ``), which `apps/api/src/common/i18n/error-codes.ts:265`
  already maps by prefix to `MISSING_PERMISSION` in both locale catalogs — the literal
  `Missing permission: MENTION_EVERYONE` needs no new entry. This matches Rules item 3's own stated
  intent ("flows through the same generic-permission-denied error code rather than inventing a
  bespoke one"); the Technical approach table's line about a new `error-codes.ts` entry does not
  apply once the generic-message route was taken.
- No settings UI was added for `Role.isMentionable` — the Technical approach's file list for this
  doc does not include `RolesSettings.tsx`, so it is settable only through the existing
  `PATCH /roles/:roleId` endpoint (e.g. by another admin surface or directly) until a UI control is
  requested.

## Deployment notes

- New env vars: none.
- Migration: `Role.isMentionable` migration runs before the code deploy that reads it (standard additive-column order); no large-table lock concern (`Role` is per-server, small).
- Cache/queue to clear: none.
- Breaking API change: none — the new `403` is an additive failure mode on existing endpoints, and `isMentionable` on the role-update endpoint is an additive optional field.
- i18n: new `en`/`vi` keys must land in the same change (`npm run i18n:check` fails a literal not mapped in both catalogs) — exact key names are an implementation-time decision (see report), not fixed here.
