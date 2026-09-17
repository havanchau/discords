# Feature Spec: AutoMod

Server-defined rules that scan outgoing message content and act automatically, without a moderator reading every message.

## Goal

A server manager configures keyword, mention-spam, and link/invite rules; matching messages are blocked (or the channel is alerted) before other members see them, and every action is audited.

Acceptance criteria:

- `POST /servers/:serverId/automod-rules` creates a rule with a trigger type, a list of terms or a pattern, an action, and optional exempt roles/channels. Requires `MANAGE_SERVER`.
- A message that matches a `BLOCK_MESSAGE` rule on create or edit is rejected with `400 Message blocked by AutoMod: <rule name>` and never persisted (or, for an edit, the edit is rejected and the prior content stands).
- A message that matches an `ALERT_ONLY` rule is persisted and a system-style entry is posted to the rule's configured alert channel.
- A message that matches a `TIMEOUT_AUTHOR` rule is persisted-or-blocked per its block flag, and additionally times out the author using the existing timeout mechanism.
- Members holding an exempt role, and messages in an exempt channel, are never evaluated.
- Every AutoMod action (rule fired) is written to `AuditLog`.
- Regex rules are validated at save time and are compiled and executed with a linear-time engine (RE2), so a malicious pattern cannot hang the message path.

## Scope

- **In scope**: `AutoModRule` model, rule CRUD, evaluation hook on message create and edit (channel messages and thread messages), keyword/regex/mention-spam/invite-link/external-link triggers, `BLOCK_MESSAGE` / `ALERT_ONLY` / `TIMEOUT_AUTHOR` actions, exempt roles/channels, audit logging, AutoMod section in server settings.
- **Out of scope**: DM message scanning, image/attachment content scanning, machine-learning based detection, per-rule custom punishment durations beyond the existing timeout duration list, editing history/appeals workflow.

## Current Behavior

- Message content has no server-side content policy beyond trim-and-non-empty (`apps/api/src/modules/messages/messages.service.ts:167-172`).
- `createMessage` checks readable channel, `SEND_MESSAGES`, and `requireNotTimedOut` before persisting (`apps/api/src/modules/messages/messages.service.ts:163-166`).
- `updateMessage` only checks that the caller is the channel and the message author, with no content re-validation beyond `trim()` (`apps/api/src/modules/messages/messages.service.ts:367-379`).
- Timeouts are enforced through `PermissionsService.requireNotTimedOut` and set via `ServerMember.timeoutUntil`, with allowed durations `0, 1, 5, 10, 60, 1440, 10080` minutes (`docs/features/member-timeout-and-slowmode.md`); there is no service method yet to set a timeout from inside `MessagesService` — today only `server-moderation.service.ts` does it.
- Audit entries are written through the private `writeAuditLog(serverId, actorId, action, targetId?, metadata?)` helper, one per service (`apps/api/src/modules/messages/messages.service.ts:726-736`, mirrored in `servers.service.ts`).
- Invite links look like `<origin>/invite/<code>` where `code` is `randomBytes(8).toString('base64url')` (`apps/api/src/modules/servers/servers.service.ts:262`); there is no existing invite-link detector in message content.
- Role and channel exemption lists have a direct precedent in `ChannelPermissionOverride` (`roleId`/`memberId` per channel, `apps/api/prisma/schema.prisma:337-347`), but nothing scopes a rule by role set today.

## Changes

### Rules

- Trigger types: `KEYWORD` (case-insensitive substring match against a list of terms, max 100 terms, each 1–100 chars), `REGEX` (single pattern, max 200 chars), `MENTION_SPAM` (more than `mentionLimit` distinct `@username` or `@role` tokens in one message, `mentionLimit` 1–50), `INVITE_LINK` (message contains this server's invite path or any `discords.gg/<code>`-shaped link — the shared origin), `EXTERNAL_LINK` (message contains any `http(s)://` URL not on an allowlist of domains).
- Exactly one trigger type per rule; a server can have up to 20 active rules.
- Action: `BLOCK_MESSAGE`, `ALERT_ONLY`, or `TIMEOUT_AUTHOR` (`TIMEOUT_AUTHOR` also blocks the message unless `alsoAllowMessage` is set). `TIMEOUT_AUTHOR` uses a fixed `timeoutMinutes` from the same allowed-duration list as manual timeout (`docs/features/member-timeout-and-slowmode.md`), never the owner as target.
- `alertChannelId`, required only for `ALERT_ONLY` and `TIMEOUT_AUTHOR` without `BLOCK_MESSAGE`, must be a text channel of the same server (`404 Channel not found`).
- `exemptRoleIds` and `exemptChannelIds` are optional arrays validated against the server's own roles/channels.
- Evaluation order for a message: exempt channel → exempt role (member has any) → rules in `position` order; the first `BLOCK_MESSAGE`/`TIMEOUT_AUTHOR`-with-block match stops evaluation and rejects; `ALERT_ONLY` and non-blocking matches do not stop evaluation, so several may fire on one message.
- Applies to `createMessage` and `createThreadMessage` (new message) and to `updateMessage` (edited content re-evaluated the same way; a blocked edit returns `400` and leaves the stored message unchanged).
- Regex safety: patterns are compiled with a linear-time RE2 engine at save time; a pattern RE2 cannot compile (backreferences, lookaround) is rejected with `400 Pattern is not supported`. Native `RegExp` is never used for user-supplied patterns: JavaScript regex execution is synchronous and cannot be interrupted, so a wall-clock budget cannot stop catastrophic backtracking once it starts on the event loop.
- A rule creating/editing/deleting requires `MANAGE_SERVER` and is audited as `AUTOMOD_RULE_CREATE` / `_UPDATE` / `_DELETE` `{ name, triggerType, action }`. A rule firing is audited as `AUTOMOD_RULE_TRIGGERED` `{ ruleId, ruleName, authorId, channelId, action }` — content itself is not stored in the audit metadata to avoid duplicating moderation-sensitive text outside the message table.

### Client

- Server settings gains an "AutoMod" section: rule list (name, trigger summary, action badge, enabled toggle) and a rule form (name, trigger type, terms/pattern editor, action, alert channel select, exempt roles multi-select, exempt channels multi-select); loading, empty, and error states, gated on `MANAGE_SERVER` like other management sections.
- The composer shows the server's own `400` message verbatim when a send or edit is blocked (same pattern the composer already uses for timeout/slowmode errors, `docs/features/member-timeout-and-slowmode.md`).
- New user-facing strings (rule form labels, the blocked-message toast, the alert-channel system message) go into `apps/web/src/i18n/locales/en.ts` and `vi.ts`, per `docs/features/i18n-localization.md`.

## Technical Approach

### Data model

```prisma
enum AutoModTriggerType {
  KEYWORD
  REGEX
  MENTION_SPAM
  INVITE_LINK
  EXTERNAL_LINK
}

enum AutoModAction {
  BLOCK_MESSAGE
  ALERT_ONLY
  TIMEOUT_AUTHOR
}

model AutoModRule {
  id               String             @id @default(cuid())
  serverId         String
  name             String
  triggerType      AutoModTriggerType
  terms            String[]           @default([])
  pattern          String?
  mentionLimit     Int?
  allowedDomains   String[]           @default([])
  action           AutoModAction
  alsoAllowMessage Boolean            @default(false)
  timeoutMinutes   Int?
  alertChannelId   String?
  exemptRoleIds    String[]           @default([])
  exemptChannelIds String[]           @default([])
  position         Int                @default(0)
  enabled          Boolean            @default(true)
  createdById      String
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  server           Server  @relation(fields: [serverId], references: [id], onDelete: Cascade)
  alertChannel     Channel? @relation(fields: [alertChannelId], references: [id], onDelete: SetNull)

  @@index([serverId, position])
}
```

Migration `20260917001000_add_automod_rules`.

### API

| Method   | Path                               | Body                                                                                                                                                                      | Response                       | Rate limit |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| `GET`    | `/servers/:serverId/automod-rules` | —                                                                                                                                                                         | `{ rules: AutoModRuleView[] }` | default    |
| `POST`   | `/servers/:serverId/automod-rules` | `{ name, triggerType, terms?, pattern?, mentionLimit?, allowedDomains?, action, alsoAllowMessage?, timeoutMinutes?, alertChannelId?, exemptRoleIds?, exemptChannelIds? }` | `201 { rule }`                 | 20/min     |
| `PATCH`  | `/automod-rules/:ruleId`           | same fields, optional, plus `enabled?`                                                                                                                                    | `{ rule }`                     | 20/min     |
| `DELETE` | `/automod-rules/:ruleId`           | —                                                                                                                                                                         | `{ ok: true }`                 | 20/min     |

### Realtime

- No new socket event: a blocked send/edit surfaces as the existing `HttpException` path (`message:create`/`message:update` acknowledgement error, same mechanism as `docs/features/member-timeout-and-slowmode.md`'s socket acknowledgement). An `ALERT_ONLY` fire posts a normal message from a system context to `alertChannelId`, which reaches members through the existing `message:created` channel-room broadcast — no new event type.

### Files

- API: `modules/automod/automod.module.ts`, `automod.controller.ts`, `automod.service.ts` (rule CRUD + `evaluate(serverId, memberId, roleIds, channelId, content): AutoModResult`), `automod/safe-regex.ts` (RE2 compile/match wrapper), `automod/dto/*.ts`, `messages/messages.service.ts` (call `evaluate` before persisting in `createMessage`, `createThreadMessage`, `updateMessage`), `servers.module.ts`/`app.module.ts` wiring, `prisma/schema.prisma`.
- Web: `api.ts`, `hooks/useAutoModRules.ts`, `components/settings/AutoModSection.tsx`, `AutoModRuleForm.tsx`, `ServerSettings.tsx`, `i18n/locales/en.ts`, `vi.ts`.

## Trade-offs

- **In-request evaluation vs. a moderation queue**: blocking synchronously at send time matches how timeout/slowmode already work and gives the author immediate feedback; the cost is that rule evaluation adds latency to every send, bounded by RE2's linear-time matching and a max of 20 rules per server.
- **RE2 vs. native `RegExp` with a time budget vs. keyword-only**: a time budget around native `RegExp` does not work — matching runs synchronously on the event loop and cannot be aborted, so one pathological pattern blocks every request on the instance. RE2 guarantees linear-time matching; the cost is a new dependency (the native `re2` package needs a build toolchain; the pure-JS `re2js` port avoids that at some speed cost — open question) and no backreferences/lookaround. Dropping `REGEX` and shipping `KEYWORD` only was the fallback considered; it was not chosen because regex rules are a core AutoMod use case, but it remains the rollback if the dependency is rejected.
- **One trigger type per rule vs. composable conditions**: keeps the DTO and the evaluator simple and matches the "one job" shape of `ChannelPermissionOverride` (allow/deny lists, not a rule engine); a server wanting several conditions creates several rules, evaluated independently.
- **Reusing the manual timeout mechanism vs. a separate AutoMod-only punishment table**: `TIMEOUT_AUTHOR` writes to the same `ServerMember.timeoutUntil` column so the composer, audit log, and existing enforcement code do not need to know the timeout's origin; the cost is no rule-scoped "as issued by AutoMod" marker beyond the audit metadata.

## Risks & Rollback

- **Risk**: an over-broad `KEYWORD` or `EXTERNAL_LINK` rule can block legitimate messages server-wide; there is no per-message override/appeal in this scope, only exempt roles and disabling the rule.
- **Risk**: `ALERT_ONLY` posting into `alertChannelId` uses the normal message path, so a moderator without `VIEW_CHANNEL` on that channel would not see the alert; server settings should steer admins to a channel moderators can already see (not enforced by validation beyond channel existence).
- **Rollback**: revert code; the migration is additive and `enabled: false` on every existing rule (there are none pre-migration) is a no-op.

## Test Plan

- **Manual**: manager creates a `KEYWORD` rule (`BLOCK_MESSAGE`) with term "spamword" → a member's message containing it is rejected with the rule name in the error and never appears in the channel; a message without the term sends normally.
- **Manual**: manager creates a `MENTION_SPAM` rule (`mentionLimit: 3`, `ALERT_ONLY`, alert channel `#mod-log`) → a member mentioning 4 users sends successfully and a copy appears in `#mod-log`.
- **Manual**: manager creates an `INVITE_LINK` rule (`TIMEOUT_AUTHOR`, 5 minutes) → posting another server's invite link is blocked and the author's composer shows the timeout state.
- **Manual**: member in an exempt role posts content matching a `BLOCK_MESSAGE` rule → the message sends.
- **Failure case**: manager submits a `REGEX` rule with a pattern using a backreference (e.g. `(a+)\1`) → save-time RE2 compilation rejects it with `400 Pattern is not supported` and no rule is created.

## Deployment Notes

- Run migration `20260917001000_add_automod_rules` before deploying the API.
- Add the new AutoMod strings to `en.ts` and `vi.ts` in the same change and run `npm run i18n:check`.
