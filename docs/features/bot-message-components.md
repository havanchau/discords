# Bot Message Components (Buttons & Select Menus)

- **Status**: draft — awaiting review
- **Date**: 2026-09-18
- **Related**: [`bot-api.md`](./bot-api.md) (bot identity, `/bot-api/*` allowlist, `BotAuthGuard`),
  [`bot-gateway-and-slash-commands.md`](./bot-gateway-and-slash-commands.md) (gateway delivery,
  `Interaction` lifecycle, `interaction:create`/`interaction:timeout`, the invoke → deliver →
  callback pattern this doc reuses) — listed there as deferred to "phase 4+" (`bot-api.md:27`,
  `bot-gateway-and-slash-commands.md:70`).

## Goal

A bot attaches interactive **buttons** and a **select menu** to a message it sends. A member who can
view the channel clicks one; the API turns that click into an `Interaction` (the same lifecycle
`bot-gateway-and-slash-commands.md` already built for slash commands), delivers it to the bot's
gateway socket, and the bot answers within a deadline either by updating the original message or by
sending a new one. No new transport is introduced: components reuse the existing bot gateway
connection, the existing `Interaction`/`InteractionStatus` model, and the existing REST callback
pattern.

**Acceptance criteria**:

- [ ] A bot's `POST /bot-api/channels/:channelId/messages` and its interaction callback
      (`POST /bot-api/interactions/:token/callback`) accept an optional `components` array; an
      invalid shape (too many rows, duplicate `customId`, bad URL, label too long) is rejected with
      `400` before the message is stored.
- [ ] A member with `ViewChannel` on the message's channel can click a button or pick a select
      option; the API creates a `MESSAGE_COMPONENT` interaction and delivers `interaction:create` to
      the owning bot's socket, exactly like a slash command invoke.
- [ ] The bot can respond with `type: 'MESSAGE'` (post a new message, current behavior unchanged) or
      `type: 'UPDATE_MESSAGE'` (edit the original message's content and/or components in place); the
      edited message reaches every viewer through the existing `message:updated` broadcast.
- [ ] A component interaction that goes unanswered for `INTERACTION_TIMEOUT_MS` is marked
      `TIMED_OUT`; the clicking member sees the same "The application did not respond" notice the
      slash-command flow already shows.
- [ ] A link (URL) button opens the URL client-side without creating an interaction at all — it is
      never sent to the bot.
- [ ] Clicking a component on a message in a channel the clicker cannot view, or clicking after the
      bot that owns the message has been removed from the server, is rejected the same way an
      unauthorized slash-command invoke is today.
- [ ] A member currently under timeout cannot click a component — `403`, same as their being unable
      to send, edit, react, or vote (Open Question #51, decided).

Implementation status: code complete (backend, migration, shared types, web rendering and click
flow) and typecheck/lint/build-verified; **not yet runtime-verified** — the migration
(`20260925006000_add_message_components`) has not been applied to any database in this session (the
task's environment note reserves that step for the user), so none of the above could be exercised
against a live API. See Test plan for the manual scenario to run once the migration lands.

## Scope

**In scope**

- `components` field on a bot-sent or bot-updated message: up to 5 action rows, each row holding
  either up to 5 buttons or exactly 1 select menu.
- Button styles: `PRIMARY | SECONDARY | SUCCESS | DANGER | LINK`; a `LINK` button carries a
  validated `http(s)` URL and never round-trips to the API.
- A single-select select menu with up to 25 options (no multi-select in this pass — see Trade-offs).
- New `MESSAGE_COMPONENT` interaction type on the existing `Interaction` model, sharing its
  `PENDING → RESPONDED | TIMED_OUT` lifecycle, gateway delivery, and timeout sweep.
- Click endpoint (session auth), validation, permission check, rate limiting.
- Callback response types `MESSAGE` (new message) and `UPDATE_MESSAGE` (edit the original).
- Disabled component state (bot marks a button/select `disabled: true`; the client renders it
  non-clickable and the API rejects a click on it).
- Web rendering of components on a message row, and the click → waiting → resolved/timeout flow,
  reusing `useSlashCommandInvocation.ts`'s waiting-state pattern.
- DB migration extending `Interaction` (nullable `commandId`, new columns) and adding `components`
  to `Message`.

**Out of scope** (spelled out, not an oversight)

- **Ephemeral (invoker-only) responses** — `bot-gateway-and-slash-commands.md` already ruled this out
  for slash commands for the same reason (no per-user-only message rendering path exists,
  `bot-gateway-and-slash-commands.md:537,69`); a component click inherits the identical gap and the
  identical ruling. A button click always either edits the message (visible to everyone who could
  already see it) or posts a normal, publicly visible message.
- **Modals** (a form popping up in response to a click) — needs a new client-side surface (a dialog
  driven by a server-declared field schema) this repo has nothing close to; `bot-api.md`'s own phase
  4+ bucket already names "modals" next to buttons (`bot-api.md:27`).
- **Multi-select menus, autocomplete, and other component types** (text inputs, mentionable
  selects) — one select type (single-choice, static options) covers the acceptance criteria; adding
  the rest multiplies the validation and rendering surface for no case this pass needs.
- **Webhook-sent messages carrying components** — an incoming webhook has no bot identity, no
  gateway socket, and nothing to deliver an `interaction:create` to (`incoming-webhooks.md`'s
  `User.isWebhook`-style rows are not `Bot` rows); a webhook message with components would have
  buttons that can never be answered. Refused at the DTO boundary (see Changes → Edge cases).
- **Per-user component state** (e.g. a button visible only to the message's mentioned users) —
  components are visible to, and clickable by, anyone who can view the message, same visibility
  model as the message itself.
- **Deferred acknowledgement** (`type: 'DEFERRED_UPDATE'`, letting a bot buy more time before
  answering) — the existing 15-second `INTERACTION_TIMEOUT_MS` budget is reused unchanged; a bot that
  needs longer just answers with `UPDATE_MESSAGE` from a background job before the deadline, same
  constraint slash commands already accept.

## Current behavior

- `Message` has no components/embed field at all (`apps/api/prisma/models/messages.prisma:44-69`);
  the closest precedent for a JSON-shaped, bot-owned payload on a related row is
  `SlashCommand.options Json @default("[]")` (`apps/api/prisma/models/bots.prisma:32`).
- `Interaction` currently models exactly one flow — a slash-command invocation — and `commandId` is
  a required foreign key to `SlashCommand` (`apps/api/prisma/models/bots.prisma:49-65`,
  `apps/api/src/modules/bots/interactions.service.ts:63-73`). There is no interaction "type" column;
  the model assumes every row came from a command invoke.
- The invoke → deliver → callback lifecycle already built for slash commands
  (`apps/api/src/modules/bots/interactions.service.ts:36-91`,
  `apps/api/src/modules/bots/interactions.controller.ts:1-27`,
  `apps/api/src/modules/bots/bot-api.controller.ts:120-130`) is the direct precedent this doc extends:
  session-auth `POST /channels/:channelId/interactions` creates a `PENDING` row and returns
  immediately; `RealtimePublisher.emitToRoom(this.realtime.botRoom(botId), RealtimeEvents.InteractionCreate, payload)`
  delivers it to the bot's own socket room, never a broadcast
  (`interactions.service.ts:80-86`, `realtime-publisher.service.ts:59` for `botRoom`); the bot answers
  `POST /bot-api/interactions/:interactionToken/callback` with a claim-then-send pattern
  (`interactions.service.ts:99-124`) that reverts the claim on a failed send so the row still times
  out normally.
- The callback body today is byte-identical to `BotCreateMessageDto`
  (`apps/api/src/modules/bots/dto/bot-create-message.dto.ts:1-16`,
  `bot-gateway-and-slash-commands.md:572-575`) — it can only ever create a new message, never edit
  one; `respondToCallback` always calls `BotMessagesService.createMessage`
  (`interactions.service.ts:117`), never `MessagesService.updateMessage`.
- `MessagesService.updateMessage` already allows the **author** to edit their own message
  (`apps/api/src/modules/messages/messages.service.ts:396-436`), checked as
  `message.authorId !== userId` (`:405-407`) with no human-vs-bot distinction — a bot's synthetic
  `User` id passed as `userId` already satisfies this check today; there is simply no bot-facing route
  that calls it (`bot-api.controller.ts`'s allowlist has no `PATCH`).
- A scheduled sweep already flips `PENDING` interactions to `TIMED_OUT` past `INTERACTION_TIMEOUT_MS`
  and notifies the invoker (`bot-gateway-and-slash-commands.md:802-810`, `interaction-timeout.service.ts`,
  not re-read line-by-line here); it operates on `Interaction.status`/`createdAt` only, with no
  awareness of `commandId`, so it needs no change to also sweep component interactions.
- The composer's slash-command invoke UI (`apps/web/src/hooks/useSlashCommandInvocation.ts`,
  `apps/web/src/utils/executeSlashCommand.ts`) is the precedent for a "waiting for the bot" client
  state; `MessageRow.tsx` already renders a poll card and reply/forward headers next to a message's
  content the same way a component row would sit (`apps/web/src/components/chat/MessageRow.tsx:95-98`).
- Message rendering has no `dangerouslySetInnerHTML` in the chat components (grepped, none found) —
  labels and text are rendered as ordinary JSX children, which React escapes by default.
- `link-previews` DTO shows the repo's existing URL-validation idiom:
  `@IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })`
  (`apps/api/src/modules/link-previews/dto/link-preview-query.dto.ts:5`).
- `messages.controller.ts` already has a `PATCH messages/:messageId` route for a human's own edit
  (`apps/api/src/modules/messages/messages.controller.ts:104`) — the precedent for adding a
  bot-callback-driven edit path without inventing a new verb.

## Changes

### Rules / Flow

1. **A bot attaches components when it sends or updates a message.** `components` is accepted on:
   - `POST /bot-api/channels/:channelId/messages` (`BotCreateMessageDto`), and
   - `POST /bot-api/interactions/:interactionToken/callback` (both response types below).
     Human message sends (`CreateMessageDto`) and webhook sends never accept `components` — the field
     does not exist on their DTOs.
2. **Shape**: `components` is an array of **action rows** (max 5). Each row is either:
   - up to 5 **buttons** (`type: 'BUTTON'`, `style`, `label` ≤ 80 chars, and either `customId`
     (≤ 100 chars, required for every non-`LINK` style) or `url` (required only for `style: 'LINK'`,
     validated `http`/`https`), plus an optional `disabled: boolean`; or
   - exactly 1 **select menu** (`type: 'SELECT'`, `customId` ≤ 100 chars, `options`: 1–25 entries of
     `{ label ≤ 100 chars, value ≤ 100 chars, description? ≤ 100 chars }`, `placeholder?` ≤ 150
     chars, `disabled?`).
     A row mixing buttons and a select, more than 5 buttons, more than one select, or an empty row is
     rejected `400`.
3. **`customId` uniqueness**: every non-`LINK` component's `customId` must be unique within the
   message (`400 Duplicate customId` otherwise) — the click endpoint resolves a component by
   `(messageId, customId)`, so a collision would make two components indistinguishable.
4. **Clicking a button or choosing a select option** (session auth, the same way a slash command is
   invoked by a human, not by the bot): `POST /messages/:messageId/component-interactions` with
   `{ customId, values?: string[] }` (`values` only for a select; omitted/ignored for a button).
   - The message must exist, not be deleted, carry a `components` array containing that `customId`,
     and that component must not be `disabled`.
   - The clicking member must hold `Permission.ViewChannel` on the message's channel — **not**
     `SendMessages` (see Trade-offs: this differs from the slash-command invoke check, which requires
     both).
   - **Decided (Open Question #51):** the clicking member must also pass
     `PermissionsService.requireNotTimedOut` — the same gate a message send, edit, reaction, and poll
     vote already run. A member currently under timeout cannot drive a bot through a component click
     either. Rationale: decision #39 already established that a timed-out member cannot even edit
     their own messages; leaving component clicks unchecked (the click endpoint requires only
     `ViewChannel`, never `SendMessages`) would be an inconsistent hole letting a timed-out member
     still act through a bot's button. Implemented in `InteractionsService.invokeComponent`
     (`apps/api/src/modules/bots/interactions.service.ts`), right after the `ViewChannel` check.
   - A `LINK` button is never posted to this endpoint at all — the client opens `url` directly
     (`target="_blank" rel="noopener noreferrer"`), so a link button has no `customId`, creates no
     `Interaction`, and never reaches the bot.
5. **The API creates an `Interaction`** with `type: 'MESSAGE_COMPONENT'`, `commandId: null`,
   `messageId`, `customId`, `componentType` (`'BUTTON' | 'SELECT'`), `values` (the select's chosen
   values, or `null` for a button), and the same `token`/`botId`/`serverId`/`channelId`/
   `invokerUserId`/`PENDING` shape a slash-command interaction already has. The owning bot is read off
   the message's author (`Message.authorId` → the `Bot.botUserId` → `Bot.id`), not from a
   `SlashCommand` row, since a component interaction has none.
6. **Delivery** is identical to a slash command: a targeted emit to `botRoom(botId)` carrying
   `{ interactionToken, type: 'MESSAGE_COMPONENT', customId, componentType, values, messageId, channelId, serverId, invoker }`.
   A bot with no live socket still gets an `Interaction` row that waits out the TTL, same as today
   (Edge cases table, `bot-gateway-and-slash-commands.md`'s "Bot offline" row applies unchanged).
7. **The bot answers** `POST /bot-api/interactions/:interactionToken/callback` with
   `{ type: 'MESSAGE', content, replyToMessageId? }` (unchanged shape, creates a new message — the
   existing behavior) or `{ type: 'UPDATE_MESSAGE', content?, components? }` (new: edits the
   original message the component lived on). `type` defaults to `'MESSAGE'` when omitted, so an
   existing bot answering a slash command with the old body shape needs no change.
   - `UPDATE_MESSAGE` calls `MessagesService.updateMessage(bot.userId, interaction.messageId, { content })`
     keyed on the bot's own user id — already unchanged-permission-checked as "only the author can
     edit" (Current behavior) — then, if `components` is present, updates `Message.components` in the
     same transaction and re-broadcasts `message:updated` with the new components included.
   - `content` is optional on `UPDATE_MESSAGE` (an update may touch only `components`, e.g. disabling
     a button after it is clicked, without changing the text) — when omitted, the existing content is
     kept.
   - The claim-then-send pattern (`PENDING → RESPONDED`, reverted on failure) is reused unchanged for
     both response types.
8. **Timeout and idempotency** reuse the existing sweep and the existing `409` rules verbatim — a
   component interaction is just another row in the same `status`/`createdAt` shape the sweep already
   scans.
9. **Disabling components after a click** is the bot's own choice via `UPDATE_MESSAGE`, not an
   automatic API behavior — the API does not disable a button just because someone clicked it (a
   counter/poll-style bot may want the button to stay clickable for other members).

### Edge cases

| Case                                                                                                                   | Expected behavior                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components` empty array or omitted                                                                                    | Treated as no components; existing message rendering unchanged.                                                                                                                                                  |
| More than 5 rows / more than 5 buttons in a row / more than 1 select in a row                                          | `400` at message-create or callback time, before anything is stored.                                                                                                                                             |
| Duplicate `customId` within a message                                                                                  | `400 Duplicate customId`.                                                                                                                                                                                        |
| `LINK` button with `customId` set, or non-`LINK` button without `customId`                                             | `400` (the two are mutually exclusive by style).                                                                                                                                                                 |
| `url` on a `LINK` button is not `http`/`https`                                                                         | `400` (same `IsUrl` idiom as `link-preview-query.dto.ts:5`).                                                                                                                                                     |
| Click on a `customId` that does not exist on that message (stale client, edited message)                               | `404 Component not found`.                                                                                                                                                                                       |
| Click on a `disabled` component                                                                                        | `403 Component is disabled`.                                                                                                                                                                                     |
| Click by a member without `ViewChannel` on the message's channel                                                       | `403`, no `Interaction` row created — never trust the client-side render alone.                                                                                                                                  |
| Click by a member currently under timeout (`ServerMember.timeoutUntil`)                                                | `403`, no `Interaction` row created (Open Question #51, decided: same gate as sends/edits/reactions/poll votes).                                                                                                 |
| Click after the bot has been removed from the server (message still visible, author's membership gone)                 | `Interaction` is still created (mirrors the slash-command "bot removed mid-flight" edge case) and delivery is a no-op empty-room emit; it times out normally — same UX as an offline bot.                        |
| Callback `UPDATE_MESSAGE` for a message that was deleted between click and callback                                    | `404 Message not found`; claim is reverted, interaction still times out.                                                                                                                                         |
| Callback `UPDATE_MESSAGE` for a message the responding bot does not own (`Message.authorId` is a different bot's user) | `403 Only the author can edit this message` (the existing `updateMessage` check), claim reverted.                                                                                                                |
| Select menu click with `values` outside the declared `options`                                                         | `400 Invalid option value`.                                                                                                                                                                                      |
| Webhook-authored message with a `components` field in its create body                                                  | Rejected `400` — the webhook create DTO has no `components` field, so this is a plain unknown-field rejection (`class-validator`'s `whitelist: true`), not a new runtime check.                                  |
| Two members race-clicking the same non-idempotent button (e.g. "claim reward")                                         | Each click creates its own `Interaction`; ordering/exclusivity between them is the bot's own responsibility (same as two people invoking the same slash command concurrently today) — not arbitrated by the API. |

## Technical approach

**Files touched**

| File                                                                                                               | Change                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/models/messages.prisma`                                                                           | Add `components Json?` to `Message`.                                                                                                                                                                       |
| `apps/api/prisma/models/bots.prisma`                                                                               | `Interaction.commandId` becomes nullable; add `type InteractionType`, `messageId String?`, `customId String?`, `componentType String?`, `values Json?`; new `InteractionType` enum.                        |
| `apps/api/prisma/migrations/<new>/migration.sql`                                                                   | Hand-written, see DB / migration below.                                                                                                                                                                    |
| `apps/api/src/modules/bots/dto/message-component.dto.ts` (new)                                                     | `ButtonComponentDto`, `SelectComponentDto`, `SelectOptionDto`, row-level validation.                                                                                                                       |
| `apps/api/src/modules/bots/dto/bot-create-message.dto.ts`                                                          | Add optional `components?: MessageComponentRow[]`.                                                                                                                                                         |
| `apps/api/src/modules/bots/dto/interaction-callback.dto.ts` (new, replaces reusing `BotCreateMessageDto` directly) | `type: 'MESSAGE' \| 'UPDATE_MESSAGE'`, `content?`, `replyToMessageId?`, `components?`.                                                                                                                     |
| `apps/api/src/modules/bots/dto/component-click.dto.ts` (new)                                                       | `customId`, `values?`.                                                                                                                                                                                     |
| `apps/api/src/modules/bots/message-components.ts` (new)                                                            | Shared validation function (rows/customId-uniqueness/label & URL limits), mirroring `interactions.service.ts`'s existing `validateOptions` helper.                                                         |
| `apps/api/src/modules/bots/interactions.service.ts`                                                                | New `invokeComponent(userId, messageId, dto)` method alongside the existing `invoke`; `respondToCallback` branches on `type`.                                                                              |
| `apps/api/src/modules/bots/interactions.controller.ts`                                                             | New route `POST /messages/:messageId/component-interactions`.                                                                                                                                              |
| `apps/api/src/modules/bots/bot-messages.service.ts`                                                                | `createMessage` passes `components` through to `MessagesService.createMessage`; new `updateMessage(bot, messageId, dto)` wrapping `MessagesService.updateMessage` + components column + re-broadcast.      |
| `apps/api/src/modules/messages/messages.service.ts`                                                                | `createMessage`/`updateMessage` accept and persist `components`; `formatMessage` includes it.                                                                                                              |
| `apps/api/src/modules/messages/message.format.ts`                                                                  | Add `components: message.components ?? null` to the returned `Message`.                                                                                                                                    |
| `apps/api/src/modules/realtime/interaction-timeout.service.ts`                                                     | No change expected — already sweeps by `status`/`createdAt`, not `type`.                                                                                                                                   |
| `packages/shared/src/bots.ts`                                                                                      | New `MessageComponentRow`, `ButtonComponent`, `SelectComponent`, `SelectOption` types; `InteractionType`; extend `InteractionCreatePayload`; extend `InteractionCallbackInput`; new `ComponentClickInput`. |
| `packages/shared/src/api-contract.ts`                                                                              | Add `components?: MessageComponentRow[] \| null` to `Message`.                                                                                                                                             |
| `apps/web/src/components/chat/MessageComponents.tsx` (new)                                                         | Renders action rows: `Button` (from `components/ui`) per style, and a select using the repo's existing select control.                                                                                     |
| `apps/web/src/components/chat/MessageRow.tsx`                                                                      | Render `<MessageComponents />` next to `poll`/`forwardOrigin`, same slot pattern (`:95-98`).                                                                                                               |
| `apps/web/src/hooks/useComponentInteraction.ts` (new)                                                              | Click → wait → resolved/timeout, mirroring `useSlashCommandInvocation.ts`.                                                                                                                                 |
| `apps/web/src/i18n/locales/{en,vi}/chat.ts`                                                                        | New `component.*` keys: disabled tooltip, waiting, timeout (may reuse `slash.interaction.timeout` — decide at implementation).                                                                             |

**API contract**

- `POST /bot-api/channels/:channelId/messages` — `BotCreateMessageDto` gains optional `components`.
  `400` on shape violation (see Edge cases); otherwise unchanged.
- `POST /bot-api/interactions/:interactionToken/callback` — body becomes
  `{ type?: 'MESSAGE' | 'UPDATE_MESSAGE', content?, replyToMessageId?, components? }`.
  - `type: 'MESSAGE'` (default): unchanged from today, `content` required.
  - `type: 'UPDATE_MESSAGE'`: `content` optional, `components` optional (replaces the message's
    components wholesale when present; omitted leaves them unchanged — there is no partial-row
    patch). `200 { message }`. `404` unknown/deleted message. `403` message not owned by this bot.
- `POST /messages/:messageId/component-interactions` (session auth, `JwtAuthGuard`) —
  `{ customId, values?: string[] }` → `201 { interactionToken }`. `404` message/component not found.
  `403` missing `ViewChannel`, or component `disabled`. `400` invalid select value.
- `GET`/other existing message-read endpoints: `Message.components` is included unconditionally
  (like `attachments`/`reactions`), no new query param.

**DB / migration**

- `Message.components Json?` — nullable, no default needed since most messages have none; no
  backfill, no table rewrite risk (Postgres `ADD COLUMN ... NULL` is metadata-only).
- `Interaction`:
  - `commandId` becomes nullable (`ALTER COLUMN "commandId" DROP NOT NULL`) — a component
    interaction has no `SlashCommand`. The existing `commandId → SlashCommand` foreign key already
    tolerates `NULL` once the `NOT NULL` constraint is dropped; `onDelete: Cascade` on a `NULL` FK is
    a no-op, unaffected.
  - New nullable columns: `type` (`InteractionType`, `NOT NULL DEFAULT 'APPLICATION_COMMAND'` so
    every existing row backfills correctly in the same statement), `messageId String?`, `customId
String?`, `componentType String?`, `values Json?`.
  - New enum `InteractionType { APPLICATION_COMMAND MESSAGE_COMPONENT }`.
- Migration name: `20260918008000_add_message_components` (after
  `20260918007000_add_stage_channels`, the latest one in the repo).
- No lock risk beyond a metadata-only `ALTER TABLE` on two tables that are either empty
  (`Interaction` rows are short-lived) or small relative to `Message`; `ADD COLUMN` without a
  non-null default on `Message` does not rewrite the table on Postgres ≥ 11.

**Libraries** — none new. Reuses `class-validator`/`class-transformer` (already used for
`SlashCommandOptionDto`'s nested-array pattern), the existing `RedisFixedWindowLimiter` /
`@RateLimit` decorator, and `RealtimePublisher.emitToRoom`/`botRoom` unchanged.

## Trade-offs

| Option                                                                                                              | Pros                                                                                                                                                                                                                                                                                                 | Cons                                                                                                                                                                                                           | Verdict                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reuse `Interaction`/`InteractionStatus` with a new `type` (chosen)**                                              | Zero new lifecycle code: gateway delivery, timeout sweep, idempotent callback claim all keep working unmodified; a bot's existing socket handling of `interaction:create` needs only a `type` branch.                                                                                                | `Interaction` now conflates two shapes in one table (`commandId` nullable, `messageId`/`customId` nullable) — a bit of column overlap, same class of smell `bot-api.md` already accepted for `MemberKind.BOT`. | Chosen: the lifecycle (deliver once, answer once, time out once) is identical between a command and a component click; a second table would duplicate the sweep, the claim logic, and the socket payload shape for no behavioral difference.                                                       |
| A separate `ComponentInteraction` table/lifecycle                                                                   | Cleaner schema, no nullable columns.                                                                                                                                                                                                                                                                 | Duplicates the timeout sweep, the claim-then-send transaction, and the gateway delivery path; two lifecycles to keep in sync for every future change (e.g. a rate-limit tweak would need to land twice).       | Ruled out — the duplication cost outweighs the schema-purity gain for a lifecycle that is otherwise identical.                                                                                                                                                                                     |
| `components` as `Json` on `Message` (chosen)                                                                        | Matches the existing `SlashCommand.options Json` precedent; no join needed to render a message; a component row has no per-row relational need (no vote counting, no per-user state) the way `Poll`/`PollOption`/`PollVote` genuinely need three tables for.                                         | No referential integrity on `customId`s from the DB side; validated only at the API boundary.                                                                                                                  | Chosen — components are read-mostly, bot-authored, and replaced wholesale on update; a relational model would only pay off if per-component state (e.g. per-user click count) were needed, which is out of scope.                                                                                  |
| Click check requires only `ViewChannel` (chosen) vs. `ViewChannel` + `SendMessages` (matching slash-command invoke) | Matches the observable behavior members expect (a read-only/announcement channel can still host a clickable poll-close or role-picker button; the bot, not the clicker, posts/edits); avoids surprising a viewer who is muted/restricted from sending but should still be able to vote via a button. | Inconsistent with slash-command invoke's stricter check in the same codebase — a reviewer must remember two different rules for what looks like the same "interaction invoke" shape.                           | Chosen, called out explicitly rather than silently diverging — flagged in Open Questions for confirmation, since it is a judgment call not derived from an existing rule.                                                                                                                          |
| `type: 'UPDATE_MESSAGE'` reuses `MessagesService.updateMessage` (chosen)                                            | No new permission/AutoMod/timeout logic to write — a bot editing its own message goes through the exact same author-only check a human's edit already does (Current behavior).                                                                                                                       | `updateMessage`'s AutoMod re-screening runs on every component-driven edit, including one that only changes `components` and not `content` — a wasted screening call when `content` is omitted.                | Chosen; the wasted call is cheap (same as the sweep's own idle `setInterval` iterations) and skipping AutoMod conditionally would need a second code path in a function `bot-gateway-and-slash-commands.md`'s own trade-off table already treats as "reused, not reinvented" for the command flow. |
| Deferred/ephemeral responses                                                                                        | Matches Discord's most common UX (silent ack, or invoker-only reply).                                                                                                                                                                                                                                | Same client-side gap `bot-gateway-and-slash-commands.md` already ruled out ephemeral for — no per-user-only message rendering path exists.                                                                     | Ruled out for this pass, same reasoning inherited verbatim; revisit together if ephemeral is ever built.                                                                                                                                                                                           |

What the chosen option costs: `Interaction` grows two more nullable-column families and a `type`
discriminant every future reader must switch on; `respondToCallback` grows a second response shape to
validate. Both are small, additive changes to code that already exists and is exercised by the
existing slash-command test scenarios, so the incremental review surface is the new branches only,
not a new subsystem.

## Risks & rollback

- **Risk**: a bot that only ever answered `type: 'MESSAGE'` before this change keeps working
  unchanged (default), but a bot library wrapper that hardcodes the old callback body shape and
  starts sending `components` on `UPDATE_MESSAGE` without reading this doc could hit validation
  errors it has never seen before — mitigated by `type` defaulting and by every new field being
  optional.
- **Risk**: allowing a click with only `ViewChannel` (not `SendMessages`, see Trade-offs) means a
  member who is explicitly denied `SendMessages` can still trigger bot-side side effects (e.g. a
  "claim role" button) that a `SendMessages`-gated slash command would have blocked. This is an
  explicit, flagged trade-off, not an oversight (see Open Questions) — if the answer comes back
  "match the stricter slash-command rule," this is a one-line change in `invokeComponent`.
- **Risk**: `Message.components` has no DB-level integrity — a bot could theoretically write a
  `customId` referencing state it no longer expects (e.g. after the bot's own restart loses its
  in-memory mapping); this is the bot's own design problem, same as a slash command's `args` shape,
  not something the API can validate beyond structural correctness.
- **Not covered**: no rate limit specific to "clicks per member per message" beyond the existing
  per-route `@RateLimit` on the new controller method and the global per-IP middleware — a burst of
  clicks from one member across many messages is capped by the route limit, not per-message; flagged
  in Open Questions since Discord itself does not publish a per-component click limit either.
- **Not covered**: a component that references a deleted bot's message keeps rendering (buttons are
  part of the message row) but every click now 404s at delivery time inside `interaction.service`'s
  bot lookup — same dead-button UX any offline/removed bot already produces for a slash command.
- **Rollback**: both migrations are additive (`Message.components` nullable column,
  `Interaction`'s new nullable columns and enum, `commandId` becoming nullable rather than a type
  change) — reverting the code is enough; the `down` migration drops the new columns/enum with no
  data-loss concern for existing rows, since nothing outside this feature reads them.

## Test plan

Not covered by automated tests per this repo's no-test-file convention (matching
`bot-gateway-and-slash-commands.md`'s own Test Plan). Manual scenarios, extending the existing
`socket.io-client` + `curl` harness pattern used there:

1. **Happy path — button, new message.** Bot posts a message with one `PRIMARY` button
   (`customId: 'confirm'`). A member with `ViewChannel` (no `SendMessages`) clicks it →
   `POST /messages/:messageId/component-interactions` returns `201`; the bot's socket receives
   `interaction:create` with `type: 'MESSAGE_COMPONENT'`; the bot calls the callback with
   `{ type: 'MESSAGE', content: 'confirmed!' }` → a new message appears in the channel.
2. **Happy path — button, update in place.** Same setup; the bot instead answers
   `{ type: 'UPDATE_MESSAGE', content: 'Confirmed ✓', components: [] }` → the original message's
   text changes and its button disappears for every open client, via `message:updated`.
3. **Select menu.** Bot posts a select with 3 options; a member picks one → `values: ['optionB']`
   reaches the bot in `interaction:create`; the bot answers `UPDATE_MESSAGE` reflecting the choice.
4. **Link button.** Bot posts a `LINK` button with a `url` and no `customId` → clicking it in the web
   client opens the URL in a new tab and creates no interaction (assert no `POST
/messages/:messageId/component-interactions` call, no `Interaction` row).
5. **Disabled component.** Bot posts a button with `disabled: true` → the click endpoint returns
   `403 Component is disabled`; the web client renders it non-interactive.
6. **Timeout.** Click a button, do not answer within `INTERACTION_TIMEOUT_MS` → the clicker sees
   "The application did not respond"; the `Interaction` row is `TIMED_OUT`.
7. **Unauthorized click.** A member without `ViewChannel` on the channel (e.g. removed from the
   server) calls the endpoint directly → `403`; no `Interaction` row created.
8. **Stale/expired component.** Bot edits the message (removing the button) between render and
   click; the client's click lands after the edit → `404 Component not found`.
9. **Validation failures.** Register a message with 6 action rows → `400`. A row with 6 buttons →
   `400`. Two buttons sharing a `customId` → `400`. A `LINK` button with a `ftp://` URL → `400`. A
   non-`LINK` button missing `customId` → `400`.
10. **Bot ownership on update.** Bot A tries to `UPDATE_MESSAGE` a message authored by Bot B's
    interaction → `403 Only the author can edit this message`.
11. **Idempotency.** Call the callback twice for the same `interactionToken` (either response type)
    → the second call returns `409`, matching the existing slash-command behavior.

## Deployment notes

- New env vars: none — reuses `INTERACTION_TIMEOUT_MS` and the existing gateway/rate-limit constants
  from `packages/shared/src/bots.ts` unchanged.
- Migration `20260918008000_add_message_components` runs before deploying the API code that
  references the new columns; purely additive (new nullable columns, one new enum, one constraint
  relaxed from `NOT NULL` to nullable), safe to run while the previous API version still serves
  traffic — the previous version simply never reads or writes the new columns.
- No cache/queue to clear.
- Breaking API change: none. `Message.components` and the callback's new fields are additive and
  optional; existing bots that never send `components` or `type` see no behavior change.
- This repo's `docs/features/` is flat (no `overview.md` convention exists here, matching
  `bot-gateway-and-slash-commands.md:814-818`'s own note) — `bot-api.md`'s Scope section should get a
  one-line cross-reference to this doc once implemented, the same way it already points at
  `bot-gateway-and-slash-commands.md`.
