# Server bot commands admin view

- **Status**: draft — awaiting review
- **Date**: 2026-09-29
- **Related**: [`bot-command-registration-ui.md`](./bot-command-registration-ui.md) (the owner-facing
  sibling this reuses shapes from), [`bot-api.md`](./bot-api.md), [`bot-gateway-and-slash-commands.md`](./bot-gateway-and-slash-commands.md),
  [`open-questions.md`](./open-questions.md) (#53, reversed by this doc; #32, #52, #54)

## Goal

`bot-command-registration-ui.md` shipped a bot **owner's** own command-management screen in account
settings. Open question #53 asked whether a per-server admin — someone with server authority but not
necessarily the bot's owner — also needs a read-only view of what a bot has registered in *their*
server, reachable from `ServerSettings`. The assumption used until now was "out of scope"; this doc
reverses that and designs the admin view.

**Acceptance criteria**:

- [ ] From `ServerSettings`, a member holding `MANAGE_SERVER` in that server can see every bot
      currently a member of the server, and for each bot, the slash commands it has registered in
      **this** server.
- [ ] The view is read-only: no create/edit/delete action exists on this screen, for any bot,
      regardless of who owns it (including the viewer's own bot).
- [ ] The response never includes a bot's token, token hash, its owner's identity, or which other
      servers it belongs to.
- [ ] A member without `MANAGE_SERVER` (or a non-member) cannot reach the endpoint or the UI section.
- [ ] New UI strings exist as catalog keys in both `en` and `vi`; `npm run i18n:check` passes.

## Scope

**In scope**

- A new session-authenticated, `MANAGE_SERVER`-gated route that lists the bots installed in one
  server together with their commands registered in that server.
- A new `ServerSettings` section rendering that list, read-only.
- The new shared response type and its i18n keys.

**Out of scope**

- Creating, editing, or deleting a command from this view, for any bot — the bot's **owner** is the
  one accountable for what it does and remains the only actor who can change it (`bot-command-registration-ui.md`'s
  owner-facing screen, unchanged). A server admin who is not the owner has no standing to edit
  someone else's bot; giving them write access here would let any `MANAGE_SERVER` holder silently
  change another user's bot configuration, which is a different (and larger) privilege than "see what
  is registered." If a future request needs an admin to *disable* a misbehaving bot's commands in
  their own server without touching the owner's other installs, that is a new, separate action (e.g.
  a per-server "suspend" flag) and is not designed here.
- Installing or removing a bot from the server — unchanged, still `MANAGE_ROLES`-gated
  (`bot-authorization.service.ts:24`, `apps/api/src/modules/bots/bot-authorization.service.ts:144`).
- Global (cross-server) bot listing, a bot's servers other than this one, or its owner's identity —
  never exposed here (see Security).
- Ephemeral responses, buttons, autocomplete, interaction history — unchanged from
  `bot-gateway-and-slash-commands.md`'s Scope.

## Current behavior

- **No per-server admin bot view exists today.** `ServerSettings.tsx` renders sections gated on
  `memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER')` for emoji, stickers, soundboard,
  AutoMod, onboarding, discovery, templates, and insights
  (`apps/web/src/components/settings/ServerSettings.tsx:189-221`), and separately gates bans on
  `BAN_MEMBERS` and reports on `MANAGE_MESSAGES` (`ServerSettings.tsx:224-238`) — no bot-related
  section exists among them, confirmed by reading the whole file.
- **Slash commands are already sent to every member, just not grouped by bot.** `GET /servers/:serverId`
  (`ServersController.getOne`, `apps/api/src/modules/servers/servers.controller.ts:58-60`) already
  returns `slashCommands: SlashCommandView[]` — the flat list of every command registered by a bot
  still a member of the server, computed in `ServersService.getServerForUser`
  (`apps/api/src/modules/servers/servers.service.ts:158-169`) and consumed by the composer's
  suggestion list. This is sent to **every viewer who can load the server**, not gated on
  `MANAGE_SERVER` — so a command's `name`/`description`/`options` are not new information this doc
  exposes; what is new is grouping them per bot with the bot's identity, gated to admins.
- **Per-server, permission-gated read views already exist and follow one shape.** `GET
  /servers/:serverId/insights` (`servers.controller.ts:125-131`) delegates to
  `ServerInsightsService.getInsights`, whose first line is
  `await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer)`
  (`apps/api/src/modules/servers/server-insights.service.ts:38`). `requireServerPermission`
  (`apps/api/src/modules/permissions/permissions.service.ts:33-42`) calls `requireMembership`
  first, which throws `ForbiddenException('You are not a member of this server')`
  (`permissions.service.ts:25-26`) for a non-member, then `ForbiddenException('Missing permission:
  ...')` (`permissions.service.ts:41`) for a member lacking the role — **both are `403`, never
  `404`**. The web side of this pattern is `ServerInsightsSection.tsx`: a section taking only
  `serverId`, backed by its own hook (`useServerInsights.ts:10-21`), handling loading/error/empty
  explicitly, mounted in `ServerSettings.tsx:221` behind the same `MANAGE_SERVER` gate.
- **Installing/removing a bot uses a different permission and a different not-found convention.**
  `BotAuthorizationService` requires `MANAGE_ROLES`, not `MANAGE_SERVER`, because granting a bot a
  role is the same trust as creating one (`bot-authorization.service.ts:22-24,144,200`). The
  **owner-facing** command routes on `BotsController` (`bots.controller.ts:74-129`) use `404 Bot not
  found` for a bot the caller does not own (`bots.service.ts:159-168`) — a deliberate choice to never
  confirm a stranger's private bot exists. Neither convention is what this doc needs: the new route is
  not about bot ownership or role-granting, it is the same shape as `insights` — "can this member see
  server-management data" — so it follows `insights`'s `403` convention (see Technical approach).
- **`SlashCommand` rows outlive a bot's membership.** Removing a bot from a server does not cascade-delete
  its commands there (`apps/api/prisma/models/bots.prisma:29-31`, comment: "removing the bot from the
  server does not [cascade], a re-authorized bot keeps its commands"); only `serverId`/`botId` deletion
  cascades do. `ServersService.getServerForUser`'s existing query already filters this out for the
  composer (`where: { serverId, bot: { botUser: { memberships: { some: { serverId } } } } }`,
  `servers.service.ts:159`) — the same filter this doc's new query uses, so an admin never sees a
  "ghost" bot that left the server.
- **Bot token storage.** `Bot.tokenHash` stores only the SHA-256 of the token's secret half, verified
  with `secretTokenMatches` (constant-time); the plaintext token is returned exactly once, at create or
  regenerate, and never stored (`bot-api.md`'s Deviations, "Token format";
  `apps/api/src/modules/bots/bots.service.ts:71-78`, `hashSecretToken` call). `Bot.ownerId` links to
  the owner's `User` row but the owner's email/username is never joined into any bot-listing query read
  for this doc (`bots.service.ts`'s `ownedBotSelect`, `requireOwnedBot`'s select,
  `bots.service.ts:19-25,152-160`, never selects `owner`). The unrelated migration
  `20260918006000_hash_tokens_sha256` (`apps/api/prisma/migrations/20260918006000_hash_tokens_sha256/migration.sql`)
  only added lookup indexes for `Session.refreshHash` and `EmailVerificationToken.tokenHash` — it does
  not touch `Bot.tokenHash`, which has no index (`bot-api.md`'s Deviations, "Token format").
- **`OwnedBot` (what an owner's own bot list returns) includes `serverCount`**
  (`packages/shared/src/bots.ts:18-25`) — a count of every server the bot is a member of, anywhere.
  This field must **not** appear in the admin view's response: it is exactly the "which other servers
  is this bot in" fact this doc's Security acceptance criterion forbids leaking to a non-owner admin.
- **No permission decorator/guard exists for a permission check** in this repo — `requireServerPermission`
  is called explicitly inside the service method, same as every sibling (`server-insights.service.ts:38`,
  `automod` and `onboarding` services, not re-read line-by-line here but same call visible via grep of
  `requireServerPermission` across `modules/servers` and `modules/automod`).

## Changes

### Rules / Flow

1. **Entry point.** In `ServerSettings.tsx`, a new `<ServerBotsSection serverId={server.id} />` is
   added, gated the same way every `MANAGE_SERVER` section already is:
   `{memberHasServerPermission(server, auth.user.id, 'MANAGE_SERVER') ? <ServerBotsSection
   serverId={server.id} /> : null}` — placed next to `ServerInsightsSection`, the closest sibling in
   shape (read-only, per-server, `MANAGE_SERVER`-gated, own hook).
2. **Fetch.** Opening the settings panel (the section is not lazily opened behind a dialog, unlike
   `BotCommandsDialog`, because there is no server-picker step here — the server is already fixed by
   which settings panel is open) fetches `GET /servers/:serverId/bots` once via its own hook.
3. **List.** The response is grouped by bot: each bot's identity (`id`, `name`, `avatarUrl`) followed
   by its commands in this server (`name`, `description`, option count) — read-only rows, no
   edit/delete affordance, matching the "informational, not disabled" row rule
   (`~/.claude/rules/design-rules.md` → Component rules: "A non-interactive row is informational, not
   disabled: it keeps readable contrast").
4. **Empty states, two levels.** Zero bots installed → one empty-state note for the whole section
   (`bot.serverBots.empty`). A bot installed but with zero commands in this server → a per-bot inline
   note (`bot.serverBots.noCommands`), not a section-level empty state, since other bots in the list
   may still have commands.
5. **No mutation path.** No form, no delete button, no `useMutation` anywhere in this feature — the
   hook exposes only a query.

### Edge cases

| Case | Expected behavior |
| --- | --- |
| Caller is not a member of the server | `403 You are not a member of this server` (`requireMembership`) — same as every other `MANAGE_SERVER` section; UI never renders the section for a non-admin because `ServerSettings.tsx`'s own gate already hides it, so this is a defense-in-depth path, not the primary UX. |
| Caller is a member without `MANAGE_SERVER` | `403 Missing permission: MANAGE_SERVER` — same reasoning as above. |
| Server has zero bots installed | `200 { bots: [] }`; section shows one empty-state note. |
| A bot is installed but has never registered a command in this server | Bot row renders with an empty, per-bot "no commands" note; the bot itself still appears (it is a member, regardless of whether it uses commands). |
| A bot was removed from the server after registering commands, then not re-authorized | Bot does not appear at all (filtered by current membership, same filter `getServerForUser` already uses) — its orphaned `SlashCommand` rows stay in the database but are invisible from every surface until the bot rejoins, unchanged existing behavior. |
| The viewer is both the server's `MANAGE_SERVER` holder and the bot's owner | Sees the exact same read-only fields as any other admin — no extra fields unlock because of ownership; the owner already has the full read/write view in account settings (`BotsSection.tsx` → `BotCommandsDialog.tsx`). |
| A bot has many commands (up to `SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER` = 25) | Rendered in full, no pagination — see Trade-offs for why. |
| Duplicate/unauthorized attempt to call the endpoint directly for a server the caller cannot see at all (deleted server, wrong id) | `requireMembership` still resolves via `serverId`; a nonexistent server yields no member row either, so the same `403 You are not a member of this server` — no `404` distinguishes "server does not exist" from "you're not in it," matching how `insights` and every other `MANAGE_SERVER` route already behave (not a new information leak introduced here). |

## Technical approach

**Files touched**

| File | Change |
| --- | --- |
| `apps/api/src/modules/servers/servers.service.ts` | Add `listInstalledBots(userId, serverId): Promise<{ bots: ServerInstalledBot[] }>` — `requireServerPermission(userId, serverId, Permission.ManageServer)`, then `prisma.bot.findMany({ where: { botUser: { memberships: { some: { serverId } } } }, select: { id, name, avatarUrl, slashCommands: { where: { serverId }, orderBy: { name: 'asc' } } } })`, mapping each row's commands through the already-exported `toSlashCommandView` (`@/modules/bots/slash-commands.service`, already imported in this file at line 12 for the same purpose). |
| `apps/api/src/modules/servers/servers.controller.ts` | Add `GET servers/:serverId/bots`, delegating straight to the new service method — same shape as the existing `GET servers/:serverId/insights` route (`servers.controller.ts:125-131`), no new guard, no `@RateLimit` (a read, like `insights`). |
| `packages/shared/src/bots.ts` | Add `export interface ServerInstalledBot { id: string; name: string; avatarUrl: string \| null; commands: SlashCommandView[] }` next to `OwnedBot`, with a comment stating it deliberately excludes `serverCount`/owner identity. |
| `apps/web/src/hooks/useServerBots.ts` (new) | `useServerBots(serverId)`: React Query hook following `useServerInsights.ts`'s shape exactly — `apiRequest<{ bots: Json<ServerInstalledBot>[] }>('/servers/${serverId}/bots', {}, token)`, returns `{ bots, isLoading, error }`. |
| `apps/web/src/components/settings/ServerBotsSection.tsx` (new) | Read-only section: loading/error/empty states (mirroring `ServerInsightsSection.tsx:29-59`), one row per bot (`Avatar` + name, reusing `BotsSection.tsx:182-187`'s row shape), and a nested read-only list of that bot's commands (name, description, `bot.commands.optionCount`-style option count) — no form, no mutation import. |
| `apps/web/src/components/settings/ServerSettings.tsx` | Add the `MANAGE_SERVER`-gated `<ServerBotsSection serverId={server.id} />`, placed beside `ServerInsightsSection` (`ServerSettings.tsx:221`). |
| `apps/web/src/query/queryKeys.ts` | Add `serverBots: (serverId: string) => ['server-bots', serverId] as const` next to `serverEmojis`/`serverInsights` (`queryKeys.ts:13,32-33`). |
| `apps/web/src/i18n/locales/{en,vi}/bots.ts` | New keys under a `bot.serverBots.*` namespace (see i18n below) — section title/hint, empty state, per-bot empty state, error fallback. |

**API contract**

- `GET /servers/:serverId/bots` (session auth, existing `JwtAuthGuard` on `ServersController`) →
  `200 { bots: ServerInstalledBot[] }`.
- Errors: `403 You are not a member of this server` (non-member); `403 Missing permission:
  MANAGE_SERVER` (member without the permission). No `404` — see Current behavior and the "404 vs 403"
  decision below.
- No query/pagination parameters. A server's installed-bot count is bounded by how many times an
  admin manually authorized one (`MANAGE_ROLES`-gated, one at a time); nothing in this repo caps it,
  but nothing makes it large either — same reasoning `ServerBansSection`/`ServerEmojiSection` already
  apply to their own unpaginated per-server lists.

**404 vs 403 — explicit decision.** `bot-command-registration-ui.md` recorded a `404` for a non-owner
reaching the **owner's** command routes, specifically to avoid confirming a stranger's private bot
exists. That is not this route's shape: `GET /servers/:serverId/bots` is not asking "does bot X belong
to you," it is asking "can this member see this server's management data" — the exact question
`requireServerPermission` already answers for every other `MANAGE_SERVER` section (insights, emoji,
stickers, soundboard, AutoMod, onboarding, discovery, templates), all of which return `403`, never
`404`, for a member who is simply not privileged enough. Diverging to `404` here would be inconsistent
with every sibling `MANAGE_SERVER` route in this codebase for no security benefit — a server's own
existence and its `MANAGE_SERVER` roster are not secrets to another member of that same server the way
a stranger's private bot is. **Decision: follow the `insights` convention — `403` in both cases.**

**DB / migration**

None. `Bot` and `SlashCommand` already have every field this route reads
(`apps/api/prisma/models/bots.prisma:1-31`); this doc adds a new query shape, not a new column or
table.

**Libraries** — none new. Reuses `@tanstack/react-query`, the existing `Avatar`/section primitives, and
the already-exported `toSlashCommandView`.

## Security

**What must not leak to a `MANAGE_SERVER` holder who is not the bot's owner:**

| Data | In the response? | Why |
| --- | --- | --- |
| The bot's token or token hash | Never | `Bot.tokenHash` is not selected by the new Prisma query at all (the `select` clause lists only `id, name, avatarUrl, slashCommands`) — not merely omitted at the DTO layer, absent from the query. |
| The bot owner's identity (`Bot.ownerId`, the owner's `User` row, email, username) | Never | Not selected; the query never joins `Bot.owner`. |
| The bot's other servers / `serverCount` | Never | The query is filtered by `serverId` at the `Bot.findMany` level (`botUser.memberships.some({ serverId })`) and by `serverId` again for `slashCommands` — no server-wide or cross-server aggregate is computed or returned. This is why `OwnedBot` (which carries `serverCount`) is **not** reused as the response shape (see Current behavior). |
| Interaction payloads / invocation history | Never | `Interaction` is not queried by this route at all — the admin view is limited to the `SlashCommand` registry, matching what the composer already shows every member. |
| The command registry itself (`name`, `description`, `options`) | Yes, via `SlashCommandView` | Already sent to every member today through `GET /servers/:serverId`'s `slashCommands` field (Current behavior) — this doc adds grouping and bot identity on top of data already visible, not a new disclosure of the commands themselves. |
| The bot's display identity (`id`, `name`, `avatarUrl`) | Yes | Already visible to every member today via the member list, where the bot appears as a `ServerMember` with a "Bot" badge (`bot-api.md`'s Deviations, "Bots take part as members"). |

**Response DTO — entity never returned directly.** The Prisma `select` clause (not `include`) is the
enforcement point: `tokenHash`, `ownerId`, `botUserId`, `createdAt`, `updatedAt` are never fetched from
`Bot` for this route, so there is no risk of a later refactor accidentally serializing a field that was
fetched-but-meant-to-be-hidden (`~/.claude/rules/backend-nestjs.md`: "never return an entity
directly"). `ServerInstalledBot` is a new, purpose-built shared type, not `Bot` and not `OwnedBot`.

## Trade-offs

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **A (chosen): new `MANAGE_SERVER`-gated `GET /servers/:serverId/bots` on `ServersController`, reusing `toSlashCommandView`** | Matches the existing `insights` shape exactly (same permission call, same `403` convention, same web pattern) — a reviewer who knows one `MANAGE_SERVER` section knows this one; zero new guard/module wiring since `ServersService` already imports `toSlashCommandView` for the identical filtering job at `servers.service.ts:158-169`. | A second place (`servers.service.ts` and `slash-commands.service.ts`) both build `SlashCommandView` rows from the `SlashCommand` table — already true today (`getServerForUser` does this for the composer), so this doc adds a third call site to an existing, already-duplicated shape rather than introducing the duplication. | **chosen** |
| B: gate on `MANAGE_ROLES` instead of `MANAGE_SERVER`, matching install/remove | Consistent with "the same permission that lets you add or remove a bot also lets you see what it's registered." | Wrong model for a *read*: install/remove is a privilege-granting action (choosing what a bot can do, hence the escalation check in `canGrantRoles`) — viewing what is already registered is informational, the same class as `insights`/emoji/stickers, all `MANAGE_SERVER`. Gating a read on `MANAGE_ROLES` would make a `MANAGE_SERVER` admin — who can already see every other piece of server configuration — blind to bot commands specifically, for no consistent reason. | ruled out |
| C: reuse `OwnedBot` as the response shape (matching #52's "reuse the existing type, it costs nothing" reasoning for the owner's server picker) | No new shared type; #52 already set a precedent for reusing an existing shape rather than trimming a new one. | Does not apply here: #52's `ServerSummary` reuse was safe because the extra fields (`description`, `channels`) belong to the *caller's own* server picker with no cross-boundary leak. `OwnedBot.serverCount` is a cross-server aggregate about *someone else's* bot — reusing it here is exactly the leak the Security section forbids. The situations are not analogous; #52's reasoning does not transfer. | ruled out |
| D: paginate the bot list | Future-proofs an unbounded list. | No cap exists on bots-per-server today and none is being added; every sibling per-server admin list in this repo (bans, emoji, stickers, invites) is unpaginated. Adding pagination for a list that is manually built one `MANAGE_ROLES` action at a time is speculative complexity with no current caller. | ruled out for now |

What the chosen option costs: one more read-only route to keep in sync if `SlashCommandView`'s shape
ever changes (already true of the composer's own consumption of it); no new permission decorator, no
new guard, no new module import.

## Risks & rollback

- **What can break**: nothing existing — this is a new, additive route and a new, additive UI section.
  The main risk is the Prisma `select` clause: if a future edit changes it to `include: { }` or widens
  the `select` to grab more of `Bot`, a sensitive field could leak without a test to catch it (this
  repo has none, see Test plan) — mitigated by keeping the `select` explicit and reviewed at the same
  place this doc names it.
- **Not covered**: any write path for a non-owner admin (deliberately out of scope, see Scope); a
  per-server bot "suspend" action if that is ever requested later.
- **Rollback**: revert the controller/service/shared-type/web files; no migration to reverse, nothing
  new is written to the database (this is a read-only feature end to end).

## Test plan

**Automated**

- None — this repo has no automated test suite (`RULE.md`: "Do not create automated test files ...
  Verify changes with typecheck, lint, build, and a written manual verification scenario").

**Manual**

1. As a server owner (or a member with `MANAGE_SERVER` but not `MANAGE_ROLES`), open Server Settings
   on a server with two bots installed, one with three registered commands and one with none.
   Expected: both bots appear; the first shows its three commands (name, description, option count);
   the second shows the "no commands" note.
2. As the same admin, confirm the response body (`GET /servers/:serverId/bots`) contains no `token`,
   `tokenHash`, `ownerId`, or `serverCount` field anywhere, on either bot — including the bot the admin
   themselves happens to own, if applicable.
3. As a member of the server who does **not** hold `MANAGE_SERVER` (an admin-who-is-not-the-owner
   case is not distinct here — ownership is irrelevant to this route, only `MANAGE_SERVER` is): confirm
   the `ServerSettings` panel never renders the section, and a direct call to `GET
   /servers/:serverId/bots` with that member's session token returns `403 Missing permission:
   MANAGE_SERVER`.
4. As a user who is not a member of the server at all: confirm the same endpoint returns `403 You are
   not a member of this server`, not `404` and not `200`.
5. Remove a bot from the server (existing `DELETE /servers/:serverId/bots/:botId` flow), leaving its
   previously-registered commands in the database. Reload the section. Expected: that bot no longer
   appears in the list at all.
6. Run `npm run i18n:check` after adding the new keys. Expected: passes.

## Deployment notes

- New env vars: none.
- Migration: none.
- Cache/queue to clear: none.
- This repo's `docs/features/` convention is flat (confirmed: no `docs/features/bots/overview.md`
  folder exists; `bot-api.md`, `bot-gateway-and-slash-commands.md`, and
  `bot-command-registration-ui.md` are themselves flat docs) — no `overview.md` to update. This is now
  the third bot-related flat doc; per `~/.claude/rules/documentation.md`, promoting to a
  `docs/features/bots/overview.md` folder should be considered at the next bot-related task, not in
  this change.
- Breaking API change: none — purely additive route.

## Open item found while writing this doc (not resolved here)

`bot-command-registration-ui.md`'s open question #54 recorded the assumption "singular `bot.command.*`,
matching the existing singular convention in `bots.ts`," but the keys actually shipped in
`apps/web/src/i18n/locales/en/bots.ts` (e.g. `bot.commands.action.add`, `bot.commands.field.name`,
lines verified by reading the file) use the **plural** `bot.commands.*` prefix throughout — the
opposite of the recorded assumption. This doc follows the prefix that actually shipped (plural, for
anything under the commands sub-tree) and introduces a new `bot.serverBots.*` prefix for
strings specific to this admin view (section title/hint/empty states), rather than perpetuate a
naming split. Whoever owns `open-questions.md` should update #54's "Assumption used" column to match
the shipped code — flagged here rather than edited directly, since this doc must not touch
`open-questions.md`.
