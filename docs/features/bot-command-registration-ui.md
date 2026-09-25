# Bot command registration UI

- **Status**: draft — awaiting review
- **Date**: 2026-09-25
- **Related**: [`bot-api.md`](./bot-api.md), [`bot-gateway-and-slash-commands.md`](./bot-gateway-and-slash-commands.md), [`open-questions.md`](./open-questions.md) (#52–#54)

## Goal

`bot-gateway-and-slash-commands.md` shipped the registry (`SlashCommand` table, `/bot-api/servers/:serverId/commands`
CRUD) and the invocation flow, but only the bot's own REST token can call the registry — a bot owner
has no screen to create, edit, or delete their bot's slash commands. Today the only way to register a
command is to write a script that calls `/bot-api/*` directly with the bot's secret token. This doc adds
that missing UI, plus the minimum new session-authenticated API surface it needs, so a bot owner can
manage commands from the account settings screen the same place they manage the bot itself.

**Acceptance criteria**:

- [ ] From `BotsSection` (account settings), the owner of a bot that is a member of at least one server
      can open a "manage commands" view for that bot, pick one of its servers, and see the commands
      currently registered there.
- [ ] The owner can create a command (name, description, up to `SLASH_COMMAND_OPTIONS_MAX` options),
      edit an existing command's description/options, and delete a command, entirely from the UI,
      without ever seeing or needing the bot's secret token.
- [ ] Every validation rule already enforced by `SlashCommandsService`/its DTOs (reserved name, per-server
      limit, name pattern, immutable name) is reflected in the UI before submit and surfaced from the
      API's rejection when it still fails server-side.
- [ ] A user who is not the bot's owner cannot reach or call this UI/endpoint for someone else's bot
      (403/404, never silently empty).
- [ ] New UI strings exist as catalog keys in both `en` and `vi`; `npm run i18n:check` passes.

## Scope

**In scope**

- A new session-authenticated (`JwtAuthGuard`) route group for command CRUD, scoped to bots the caller
  owns, that delegates into the existing `SlashCommandsService`.
- A new session-authenticated route to list the servers a bot is a member of (needed for the server
  picker; nothing today exposes this to the owner over user auth).
- The React UI: entry point in `BotsSection.tsx`, a dialog/panel for server selection + command list +
  create/edit form, wired through React Query the same way `useOwnedBots`/`useBotAuthorization` are.
- New i18n keys in `apps/web/src/i18n/locales/{en,vi}/bots.ts`.

**Out of scope**

- Any change to the existing bot-token routes (`/bot-api/servers/:serverId/commands`) or to
  `SlashCommandsService`'s business logic — this doc only adds a second, user-authenticated way to call
  the same service, it does not change what is allowed.
- The invocation flow, the composer, interactions, or the gateway — unchanged, already shipped.
- Autocomplete, buttons, modals, or any option type beyond `STRING | INTEGER | BOOLEAN | USER | CHANNEL`
  — unchanged from `bot-gateway-and-slash-commands.md`'s Scope.
- A per-server admin view of a bot's commands (i.e. reachable from `ServerSettings` instead of account
  settings) — grep of `apps/web/src/components/settings/ServerSettings.tsx` shows no bot-related tab
  there today, and adding one is a separate, larger scope decision (see `open-questions.md` #53).

## Current behavior

- `BotsSection.tsx` renders bot creation, avatar upload, authorize-link copy, token regenerate, and
  delete — no occurrence of the word "command" anywhere in the file
  (`apps/web/src/components/settings/BotsSection.tsx:1-253`, verified by reading the whole file).
- The command registry endpoints exist and work, but only under bot-token auth:
  `@UseGuards(BotAuthGuard)` on the whole controller (`apps/api/src/modules/bots/bot-api.controller.ts:39`),
  with `GET/POST /bot-api/servers/:serverId/commands` and
  `PATCH/DELETE /bot-api/servers/:serverId/commands/:commandId`
  (`apps/api/src/modules/bots/bot-api.controller.ts:92-123`). `BotAuthGuard.canActivate` requires an
  `Authorization: Bot <token>` header and rejects anything else, including a session JWT
  (`apps/api/src/modules/bots/bot-auth.guard.ts:34-40`) — a signed-in user's session token cannot call
  these routes at all.
- `BotsController`, the only user-JWT-guarded bot controller (`@UseGuards(JwtAuthGuard)`,
  `apps/api/src/modules/bots/bots.controller.ts:12`), exposes bot create/list/regenerate/delete and the
  authorize flow, but nothing about commands
  (`apps/api/src/modules/bots/bots.controller.ts:1-67`, verified by reading the whole file).
- `SlashCommandsService` (list/create/update/remove) already takes a `RequestBot`-shaped
  `{ botId, userId, username }` and does all validation and persistence
  (`apps/api/src/modules/bots/slash-commands.service.ts:40-126`); it has no dependency on how the caller
  authenticated, only on `bot.botId`. `RequestBot` is defined at `apps/api/src/modules/bots/bot-request.ts:6-11`.
- `OwnedBot` (what `GET /bots` returns) has `id, name, avatarUrl, createdAt, serverCount` — a count only,
  no per-server ids/names (`packages/shared/src/bots.ts:18-25`;
  `apps/api/src/modules/bots/bots.service.ts:17-29` for the Prisma select that produces it). There is
  today no owner-facing endpoint that lists _which_ servers a bot belongs to; the closest thing,
  `GET /bots/:botId/authorize` → `BotAuthorizationService.getAuthorizationView`, lists servers where the
  **caller** holds `MANAGE_ROLES` (`apps/api/src/modules/bots/bot-authorization.service.ts:35-78`), which
  is not the same set when the bot was authorized into a server by someone other than its owner.
- `BotsService.requireOwnedBot(userId, botId)` is the existing ownership-check pattern: `prisma.bot.findFirst({ where: { id: botId, ownerId: userId } })`, `NotFoundException` otherwise
  (`apps/api/src/modules/bots/bots.service.ts:135-142`), reused by every mutating method in that service
  (e.g. `remove`, `apps/api/src/modules/bots/bots.service.ts:123-133`).
- `ServersService.listForUser(userId)` already produces the server list `/bot-api/servers` returns
  (`apps/api/src/modules/bots/bot-api.controller.ts:55-58` calls `this.servers.listForUser(bot.userId)`);
  its Prisma query filters by `members: { some: { userId } }`
  (`apps/api/src/modules/servers/servers.service.ts:55-58`) — it is identity-agnostic (works for any
  `userId`, human or bot), so it can be called with a bot's own synthetic user id from a new owner-facing
  route too.
- The web UI kit has no generic `<select>` component in `apps/web/src/components/ui`
  (`Avatar`, `Button`, `ContextMenu`, `Dialog`, `DropdownMenu`, `FormControls` (`TextField`/`TextArea`),
  `Popover`, `SelectionControls` (`Checkbox`/`Switch`), `Toast`, `Tooltip` — listed via
  `apps/web/src/components/ui/index.ts` and the directory listing). The existing server/role pickers in
  `BotAuthorizeDialog.tsx` use `SettingsSelect` from `apps/web/src/components/settings/SettingsSelect.tsx`
  (`apps/web/src/components/bots/BotAuthorizeDialog.tsx:5,138-153`) — the pattern to reuse here, not a raw
  `<select>` or a new component.
- i18n: bot-related strings live in `apps/web/src/i18n/locales/{en,vi}/bots.ts` (verified: `bot.section.title`
  greps only to those two files). `npm run i18n:check` runs `scripts/i18n-scan.mjs`
  (`package.json:23`), which scans every `apps/web/src/**/*.ts(x)` file outside the `i18n/` catalog dir for
  literal user-facing strings in JSX text and a fixed set of translated attributes (`title`, `aria-label`,
  `placeholder`, `alt`, `label`, `aria-description`; `scripts/i18n-scan.mjs:7-13`) — a new component must
  route every user-visible string through `t('bots.<key>')`, not inline text.

## Changes

### Rules / Flow

1. **Entry point.** In `BotsSection.tsx`, each bot row gains a "Manage commands" `IconButton` next to
   the existing regenerate/delete actions, enabled only when `bot.serverCount > 0` (a bot in no server
   has nowhere to register a command — same UX as the existing "no servers" empty state in
   `BotAuthorizeDialog`, `bot.authorize.noServers`).
2. **Server picker.** Opening it fetches `GET /bots/:botId/servers` (new) and shows a `SettingsSelect`
   of the bot's servers by name, defaulting to the first. Zero servers → this state cannot be reached
   per step 1's gate, but the dialog still renders the same empty copy defensively if the list comes
   back empty between the row render and the fetch (e.g. the bot was just removed from its only server).
3. **Command list.** Selecting a server fetches `GET /bots/:botId/servers/:serverId/commands` (new) and
   renders each command's name, description, and option count, with edit/delete actions — same list-row
   shape as the existing bot list in `BotsSection` (`settingsStyles.inviteRow`).
4. **Create.** A form below/above the list: name (locked to `SLASH_COMMAND_NAME_PATTERN`,
   `^[a-z][a-z0-9_-]{0,31}$`, disabled once at least one character has been typed that fails it — mirrors
   how `BotsSection` already caps `name` at `BOT_NAME_MAX_LENGTH` client-side), description (`maxLength=100`,
   matching `CreateSlashCommandDto`), and an options editor: a repeatable row of
   {name ≤32 chars, description ≤100 chars, type (`SettingsSelect` of the 5 `SlashCommandOptionType`
   values), required (`Checkbox`)}, capped at `SLASH_COMMAND_OPTIONS_MAX` (25) rows, "Add option" disabled
   past the cap. Submits `POST /bots/:botId/servers/:serverId/commands`.
5. **Edit.** Only `description` and `options` are editable — `name` renders read-only once a command
   exists (`UpdateSlashCommandDto` has no `name` field: "name is immutable; delete + recreate to rename",
   `apps/api/src/modules/bots/dto/update-slash-command.dto.ts:13`). Submits
   `PATCH /bots/:botId/servers/:serverId/commands/:commandId`.
6. **Delete.** Same confirm-then-act pattern `BotsSection` already uses for regenerate/delete
   (`confirm` state holding `{ commandId, action: 'delete' }`, a danger button that turns into
   "Confirm delete"), not a native `confirm()` dialog. Submits
   `DELETE /bots/:botId/servers/:serverId/commands/:commandId`.
7. Every mutation invalidates the command-list query for that `(botId, serverId)` pair, the same
   `invalidateQueries` pattern `useOwnedBots`'s `createMutation`/`deleteMutation` already use.

### Edge cases

| Case                                                                                        | Expected behavior                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot has zero servers                                                                        | "Manage commands" disabled on the row; if reached anyway, the dialog shows an empty-state note, no crash.                                                                                                                                                                                 |
| Reserved name (`me`, `nick`, `poll`, `invite`)                                              | Client blocks submit with an inline error before the call; if bypassed, API's `409 Command name is reserved` (`slash-commands.service.ts:55-56`) is shown as the form error.                                                                                                              |
| Duplicate name in the same server (another bot, or a retry)                                 | `409 Command name already used in this server` (`slash-commands.service.ts:77-79`), shown as the form error; command is not added to the list optimistically.                                                                                                                             |
| Per-server command limit reached (25)                                                       | `400 Slash command limit reached for this server` (`slash-commands.service.ts:60-62`); "Add command" stays enabled but the API call fails with that message — client also disables "Add command" once `commands.length >= SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER` to avoid the round trip. |
| Invalid option (bad type, name/description too long)                                        | Blocked client-side by the same constraints as the DTO; server-side `400` from `class-validator` is the fallback if bypassed.                                                                                                                                                             |
| Command deleted by someone else (bot itself, via `/bot-api/*`) between list and edit/delete | `404 Command not found` (`slash-commands.service.ts:109`) surfaces as a toast/error and the list refetches.                                                                                                                                                                               |
| Not the bot's owner                                                                         | `404 Bot not found` from the new endpoints' `requireOwnedBot` check — same shape as every other `BotsController` route on someone else's bot, never a 403 that would confirm the bot exists (matches `bots.service.ts:135-142`'s existing behavior).                                      |
| Bot removed from the selected server mid-session                                            | The next list/create/update/delete call hits `SlashCommandsService`'s own `requireBotMembership` check and returns `404 Bot is not a member of this server` (`slash-commands.service.ts:113-125`), unchanged — the new controller does not duplicate this check.                          |

## Technical approach

**Files touched**

| File                                                                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/bots/bots.controller.ts`                                 | Add `GET /bots/:botId/servers`, `GET/POST /bots/:botId/servers/:serverId/commands`, `PATCH/DELETE /bots/:botId/servers/:serverId/commands/:commandId` — all under the controller's existing `JwtAuthGuard`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/api/src/modules/bots/bots.service.ts`                                    | Add `listServers(userId, botId)` (ownership check + `ServersService.listForUser(bot.botUserId)`) and a small `toRequestBot(bot)` helper building the `RequestBot` shape `SlashCommandsService` expects, reusing `requireOwnedBot`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/api/src/modules/bots/bots.module.ts`                                     | No change needed: `BotsModule` already imports `ServersModule` (which `exports: [ServersService]`, `apps/api/src/modules/servers/servers.module.ts:40`) and already provides `SlashCommandsService` (`bots.module.ts:19,28`) — `BotsService` can inject both without any module wiring change.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/web/src/components/settings/BotsSection.tsx`                             | Add the "Manage commands" `IconButton` per bot row, opening the new dialog.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/web/src/components/bots/BotCommandsDialog.tsx` (new)                     | Server picker + command list + create/edit form, following `BotAuthorizeDialog.tsx`'s structure (`DialogRoot`/`DialogContent`, `SettingsSelect` for pickers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/web/src/hooks/useBotCommands.ts` (new)                                   | React Query hook(s): `useBotServers(botId)`, `useBotCommands(botId, serverId)` with create/update/delete mutations — mirrors `useOwnedBots.ts`'s shape (`apiRequest`, `invalidateQueries`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/web/src/query/queryKeys.ts`                                              | Add `botServers: (botId) => ['bot-servers', botId]` and `botCommands: (botId, serverId) => ['bot-commands', botId, serverId]`, following the existing naming convention (`queryKeys.ts:52-54`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `apps/web/src/i18n/locales/en/bots.ts`, `apps/web/src/i18n/locales/vi/bots.ts` | New keys, e.g. `bot.action.manageCommands`, `bot.commands.title`, `bot.commands.server`, `bot.commands.empty`, `bot.commands.field.name`, `bot.commands.field.description`, `bot.commands.field.optionName`, `bot.commands.field.optionType`, `bot.commands.field.optionRequired`, `bot.commands.action.addOption`, `bot.commands.action.create`, `bot.commands.action.confirmDelete`, `bot.commands.error.*`, `error.fallback.cannot-load-bot-servers`, `error.fallback.cannot-load-bot-commands`, `error.fallback.cannot-save-bot-command`, `error.fallback.cannot-delete-bot-command` — exact final key list decided during implementation, but every one lands in both files in the same change. |
| `packages/shared/src/bots.ts`                                                  | No change expected — `CreateSlashCommandInput`/`UpdateSlashCommandInput`/`SlashCommandView`/`SlashCommandOptionType` are reused as-is by the new endpoints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**API contract**

- `GET /bots/:botId/servers` (session auth) → `200 { servers: ServerSummary[] }` (reuses
  `ServersService.listForUser`'s existing return shape); `404` bot not owned by caller.
- `GET /bots/:botId/servers/:serverId/commands` → `200 { commands: SlashCommandView[] }`; `404` bot not
  owned, or bot not a member of `:serverId`.
- `POST /bots/:botId/servers/:serverId/commands` — body `CreateSlashCommandInput`
  (`{ name, description, options? }`) → `201 { command: SlashCommandView }`; `400` invalid options/limit
  reached; `404` bot not owned or not a member; `409` reserved/duplicate name.
- `PATCH /bots/:botId/servers/:serverId/commands/:commandId` — body `UpdateSlashCommandInput`
  (`{ description?, options? }`) → `200 { command: SlashCommandView }`; `404` bot not owned, not a
  member, or command not found.
- `DELETE /bots/:botId/servers/:serverId/commands/:commandId` → `200 { ok: true }`; `404` same as above.

All five routes sit on `BotsController`, which already carries `@UseGuards(JwtAuthGuard)` at the class
level (`bots.controller.ts:12`) — no new guard is introduced. Each handler's first step is
`bots.requireOwnedBot(user.id, botId)` (existing private method, made reusable — see below), then the
handler builds a `RequestBot`-shaped value and calls straight into the existing
`SlashCommandsService` method, so `SlashCommandsService` itself needs zero changes.

`requireOwnedBot` is currently `private` in `BotsService` (`bots.service.ts:135`). It is reused, not
duplicated: either widened to `protected`/exported for the new controller-adjacent helper, or (preferred,
smaller diff) a new `getRequestBotOrThrow(userId, botId): Promise<RequestBot>` method is added to
`BotsService` that calls the existing private `requireOwnedBot` internally and shapes the result — the
controller only ever calls the new public method, `requireOwnedBot`'s visibility does not need to change.

**DB / migration**

None. No schema change — this doc only adds a second authentication path to data `SlashCommandsService`
already reads/writes.

**Libraries** — none new. Reuses `@tanstack/react-query` (already used by every other hook in
`apps/web/src/hooks`), the existing `SettingsSelect`, and the existing `Dialog`/`FormControls`/
`SelectionControls` UI kit components.

## Trade-offs

| Option                                                                                                                                           | Pros                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Cons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Verdict    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A (chosen): new user-JWT routes on `BotsController`, delegating to the existing `SlashCommandsService`**                                       | Zero change to `SlashCommandsService`'s validation/business logic (single source of truth); matches the existing trust model — the bot's owner can already do anything these routes do by using the bot's own secret token directly, so this is convenience, not a new privilege; small diff (one new controller method group + one new service helper + no DTO duplication, `CreateSlashCommandDto`/`UpdateSlashCommandDto` are `class-validator`-decorated and get reused as-is). | Two authentication paths now reach the same mutations (bot token and session token) — any future change to `SlashCommandsService` automatically affects both, which is the point, but it does mean the "who can call this" story is spread across two guards (`BotAuthGuard` and `JwtAuthGuard` + ownership check) instead of one.                                                                                                                                                                                                                                                                                                                                                                                   | **chosen** |
| B: also require `Permission.ManageRoles` in `:serverId` for the owner-facing routes (mirroring `BotAuthorizationService`'s install/remove trust) | Consistent with "installing/removing a bot needs `MANAGE_ROLES`"; would stop a bot owner from touching commands in a server they have no standing in.                                                                                                                                                                                                                                                                                                                               | Wrong model: the _bot's owner_ already fully controls the bot (including its secret token, which bypasses any server-side permission entirely) — requiring `MANAGE_ROLES` in the server would make the UI **more** restrictive than the pre-existing bot-token path for the same actor, which is not a real security boundary (the owner can just call `/bot-api/*` directly with curl and skip it), only friction. Also `getAuthorizationView`'s `MANAGE_ROLES` filter is scoped to servers the _caller_ administers, which is not the same set as "servers the bot is in" when someone else installed it — reusing it for the server picker would hide servers the owner legitimately needs to manage commands in. | ruled out  |
| C: expose command management by extending `BotAuthGuard`/`/bot-api/*` to also accept a session token                                             | No new controller/route group; one guard, one set of routes.                                                                                                                                                                                                                                                                                                                                                                                                                        | `BotAuthGuard`'s whole point is "the entire bot-token surface, and nothing else authenticates it" (`bot-api.controller.ts:31-38`'s own doc comment) — teaching it to also accept a human session would blur that boundary for every other route on the same controller (`GET /bot-api/users/@me`, message read/send), not just commands, and risks a human session accidentally getting bot-rate-limited or a bot token accidentally reaching a route meant for humans.                                                                                                                                                                                                                                              | ruled out  |

What the chosen option costs: one new, small owner-facing controller surface to keep behaviorally in
sync with `SlashCommandsService`'s rules as they evolve (mitigated by calling the service directly,
not re-implementing the rules); the `GET /bots/:botId/servers` endpoint is a second server-listing query
next to `ServersService.listForUser`/`getAuthorizationView`, though it calls the same existing service
method rather than adding a new one.

## Risks & rollback

- **What can break**: none of the existing bot-token routes or `SlashCommandsService`'s logic changes —
  risk is isolated to the new routes and new UI. A bug in the new controller's ownership check would be
  the main concern (an owner reaching another owner's bot's commands); mitigated by reusing the exact
  `requireOwnedBot` pattern already proven on every other `BotsController` mutation.
- **Not covered**: ephemeral/ACL-per-command permissions (unchanged from `bot-gateway-and-slash-commands.md`'s
  explicit simplification); a per-server admin view of a bot's commands (Scope → Out of scope).
- **Rollback**: revert the controller/service/UI files; no migration to reverse, no data written that
  the bot-token path could not already have written.

## Test plan

**Automated**

- Repo has no test suite for this area (no `*.test.ts` beside `bots.controller.ts`/`bots.service.ts`,
  per this repo's own convention documented in memory: no test files are created here). Verification is
  manual, per below.

**Manual**

1. As user A, create a bot, authorize it into server S (existing flow). Open account settings → Bots →
   "Manage commands" on that bot. Expected: server S appears in the picker; command list is empty.
2. Create a command `name=ping`, `description=Replies with pong`, no options. Expected: `201`, appears
   in the list immediately (after query invalidation).
3. Attempt to create `name=poll` (reserved). Expected: client blocks submit, or if bypassed, API returns
   `409` and the form shows the error without adding a row.
4. Edit `ping`'s description. Expected: `200`, list shows the new description; the name field is
   read-only in the edit form.
5. Delete `ping` with the confirm step. Expected: `200 { ok: true }`, row disappears.
6. As user B (not the bot's owner), call `GET /bots/:botId/servers` and
   `POST /bots/:botId/servers/:serverId/commands` for user A's bot directly (e.g. via curl with B's
   session token). Expected: `404` on every route, same as calling any other `BotsController` mutation
   on someone else's bot today.
7. Validation failure: submit an option with `name` longer than 32 characters. Expected: client blocks
   submit; if bypassed via direct API call, `400` from `class-validator` on `SlashCommandOptionDto`.
8. Run `npm run i18n:check` after adding the new keys/strings. Expected: passes, confirming every new
   user-facing string went through `t(...)` with matching `en`/`vi` keys.

## Deployment notes

- New env vars: none.
- Migration: none.
- Cache/queue to clear: none.
- `overview.md` of this menu: this repo's `docs/features/` is flat (no `bots/` menu folder exists;
  `bot-api.md` and `bot-gateway-and-slash-commands.md` are themselves flat docs) — no `overview.md` to
  update. If a second bots-related task doc appears after this one, promoting to
  `docs/features/bots/overview.md` per `~/.claude/rules/documentation.md` should be considered then, not
  in this change.
- Breaking API change: none — purely additive routes.

## Deviations

Built 2026-09-25 against the approved spec. Differences from the text above:

1. **Rate limits on the three write routes.** The spec does not mention them; every other mutating
   route on `BotsController` carries `@RateLimit`, so `bot-command-create`/`-update`/`-delete` were
   added at 30 per 60s for consistency.
2. **Query keys carry `userId`.** The spec wrote `botServers: (botId)`. The convention it cites
   (`queryKeys.ts:52-54`, `ownedBots`/`botAuthorization`) puts `userId` first, and the file's own
   comment requires every input that changes the result to be in the key. Implemented as
   `botServers(userId, botId)` and `botCommands(userId, botId, serverId)`.
3. **Name validation is an inline error, not a disabled field.** The spec's "disabled once a character
   that fails the pattern is typed" is not implementable without blocking keystrokes mid-typing. The
   form shows the error and blocks submit instead; what the user sees matches the spec's edge-case table.
4. **`CommandForm` lives in its own file.** The agent wrote the dialog and the form in one 398-line
   file; it was split into `BotCommandsDialog.tsx` (213) and `BotCommandForm.tsx` (205) after review,
   because sibling components in this repo run 157-189 lines and `~/.claude/rules/frontend-react.md`
   caps a component at ~250. `CommandInput` is exported from the form file and imported by the dialog.
5. **`GET /bots/:botId/servers` returns the full `ServerSummary`** (including each server's channel
   list) because it reuses `ServersService.listForUser` as the spec directed, while the picker needs
   only `id` and `name`. Not a new capability — the owner already reads the same payload through the
   bot's own token at `GET /bot-api/servers` — but it is the place to trim if the payload matters.
6. **`BotsSection.tsx` is now 267 lines**, just over the ~250 guideline. The change added 14 lines;
   the file was not refactored, as that is outside this task.

**Verified**: `typecheck`, `lint` (`eslint --max-warnings 0`), `i18n:check` (en/vi parity), `ui:scan`,
`check:file-size`, `build` all pass. Owner-only access was exercised over REST: a second user reading
another owner's bot gets `404`, not `403`.

**Not verified**: the dialog in a browser (create/edit/delete a command through the UI), and the
reserved-name `409` path.
