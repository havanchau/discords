# Bot Gateway and Slash Commands (Bot API Phase 2 & 3)

Phase 2 (a bot connects over Socket.IO to receive realtime events) and phase 3 (server-registered
slash commands dispatched to a bot) of [`bot-api.md`](./bot-api.md), which shipped phase 1
(REST-only bots under `/bot-api/*`) and deliberately deferred both.

**Depends on**: [`bot-api.md`](./bot-api.md) — bot identity (`Bot` table, `BotAuthGuard`,
`Authorization: Bot <token>`, the bot's synthetic `User` row, `MemberKind.BOT`) and its permission
model are reused unchanged. **Related**: [`realtime-scale-out.md`](./realtime-scale-out.md) (Redis
adapter, the multi-instance socket model this gateway extension must keep working).

## Goal

A bot can (1) receive realtime events for the servers and channels it can already see over REST,
without polling, and (2) be the target of a slash command a member types in the composer, receiving
an `interaction:create`-style event over its own gateway connection and answering it over REST
within a deadline. No outbound HTTP call from the API to a bot is introduced — the bot always
connects out to the gateway, mirroring how a human client already works.

**Acceptance criteria**:

- [x] A bot process holding a valid bot token can open a Socket.IO connection with
      `Authorization: Bot <token>` and receive `message:created` (and the other allowlisted events)
      for channels its role can view, in servers it is a member of — nothing else. Verified
      API-side (Test Plan, 2026-09-18 run).
- [x] A bot's socket receives no event for a server it is not in, no DM traffic, no voice signaling,
      and no other bot's/human's presence outside shared servers. Verified for the private-channel
      and receive-only cases; not separately re-verified for DM/voice beyond the receive-only guard
      covering every DM/voice `@SubscribeMessage` handler (a bot never joins a DM/voice room to begin
      with, so there is no room to receive from).
- [x] A bot registers one or more slash commands scoped to a server it is installed in, without
      colliding with the four built-ins or with another bot's command of the same name in that
      server — verified API-side. **Not done**: the composer suggestion-list merge (web work, out of
      scope for this pass — see Deviations' last bullet and the handoff note).
- [x] Invoking a bot's slash command sends an `interaction:create` event to that bot's gateway
      socket and creates a short-lived `Interaction` row; the bot answers with
      `POST /bot-api/interactions/:token/callback` and the response appears in the channel. Verified
      API-side.
- [x] If the bot is offline or does not answer before the deadline, the interaction is marked
      `TIMED_OUT` and `interaction:timeout` is emitted to the invoker. **Not done**: the composer's
      "The application did not respond" UI itself (web work, out of scope for this pass).
- [x] Removing a bot from a server, or regenerating its token, disconnects its gateway socket (or
      the room it can no longer see) live, without requiring the bot to reconnect on its own.
      Verified API-side.

## Scope

**In scope**

- Bot gateway authentication (`Authorization: Bot <token>` at the Socket.IO handshake).
- Room membership for a bot socket: which server/channel rooms it joins, and how that set updates
  live on authorize/remove/role-change/channel-permission-change.
- A fixed, non-configurable allowlist of events a bot socket receives (no intents system).
- Bot sockets are receive-only except heartbeat; every write (including slash command responses)
  stays on REST, on the existing `/bot-api/*` allowlist plus two new interaction routes.
- Per-bot connection cap and gateway event-rate accounting, reusing the existing Redis limiter.
- Slash command registration: data model, registration/list/delete endpoints on `/bot-api/*`,
  collision rules against the four built-ins and against other bots in the same server.
- Composer integration: merging server-registered commands into the existing suggestion list and
  parser, and the invoke path (REST) that creates an `Interaction` and emits it to the bot.
- The interaction callback endpoint, its TTL, timeout behaviour, and idempotency.
- Prisma migration for `SlashCommand` and `Interaction`.

**Out of scope**

- Ephemeral (invoker-only) responses — the callback always posts a normal channel message in phase
  2/3; ephemeral delivery needs a per-user-only rendering path the client does not have today and is
  pushed to phase 4, same bucket as buttons/modals in `bot-api.md`'s phase 4+.
- Buttons, select menus, modals, autocomplete for slash command options — `bot-api.md` phase 4+.
- An intents-style opt-in system for gateway events — a fixed allowlist is chosen instead (see
  Changes → Gateway).
- Global (cross-server) slash command registration — phase 3 here is per-server only (see Changes →
  Registry); a bot with commands in many servers registers per server explicitly.
- DM bots, voice-connected bots, and any bot write path outside REST.
- Public bot discovery/listing — still phase 4+ in `bot-api.md`.

## Current Behavior

- **Socket auth today is session-only.** `SocketAuthService.authenticate` reads
  `client.handshake.auth.token` (or a `Bearer` header), verifies it as a session JWT with `sub`/`sid`,
  and requires a live, non-revoked, non-expired `Session` row
  (`apps/api/src/modules/realtime/socket-auth.service.ts:17-48`). There is no bot-token branch. The
  handshake middleware in `RealtimeGateway.afterInit` runs this exactly once per connection and
  disconnects on any thrown error (`apps/api/src/modules/realtime/realtime.gateway.ts:69-77`).
- **Room membership on connect** is hardcoded to a human's shape: `handleConnection` joins the
  socket to `userRoom(user.id)` and to every direct-conversation room the user belongs to
  (`realtime.gateway.ts:82-97,111-118`); there is no per-server or per-channel room join at connect
  time — those happen later via the `channel:join` event (`apps/api/src/modules/realtime/messages.gateway.ts:39-47`),
  which calls `RealtimeAccessService.requireViewableChannel` (`realtime-access.service.ts:19-30`,
  checking `Permission.ViewChannel` via `PermissionsService.hasChannelPermission`).
- **Presence** treats every connected socket as a human who should show ONLINE and appear in every
  shared server's roster (`presence.service.ts:27-46,126-134`) — nothing distinguishes a bot socket
  today because none exists.
- **Bot identity and auth** already exist for REST: `BotAuthGuard` parses `Authorization: Bot
<token>` as `<botId>.<secret>` (`bot-token.ts:13-17`), verifies the SHA-256 with
  `secretTokenMatches` (constant-time), rejects if the bot's owner has requested deletion, applies
  `BOT_API_REQUESTS_PER_MINUTE` (120/min) per bot via `RedisFixedWindowLimiter`, and sets
  `request.bot = { botId, userId, username }` (`bot-auth.guard.ts:34-76`). `BotApiController` is the
  entire bot-token surface: `GET /bot-api/users/@me`, `GET /bot-api/servers`,
  `GET /bot-api/channels/:channelId/messages`, `POST /bot-api/channels/:channelId/messages`
  (`bot-api.controller.ts:42-83`), all guarded only by `BotAuthGuard`
  (`@UseGuards(BotAuthGuard)` at `bot-api.controller.ts:33`). `BotMessagesService.createMessage`
  runs `MessagesService.createMessage` keyed on `bot.userId` and then emits `message:created` /
  `unread:updated` itself, because the REST path has no socket gateway broadcasting for it
  (`bot-messages.service.ts:37-60`).
- **Removal/regeneration today has no live socket effect** because no bot socket exists; `DELETE
/servers/:serverId/bots/:botId` deletes the `ServerMember` row (`bot-memberships.ts:11-35`, called
  from `bots.service.ts`, not re-read line-by-line for this doc) and the existing human path
  (`RealtimePublisher.disconnectSessions`, `realtime-publisher.service.ts:41-50`) disconnects
  sockets by **session id**, which a bot token has none of — this doc needs a different mechanism
  (see Changes → Gateway → Disconnect).
- **Slash commands are fully client-side.** `SLASH_COMMANDS` is a hardcoded array of 4 entries with
  `owner: 'client' | 'server'` (`apps/web/src/utils/slashCommands.ts:10-24`), matched by
  `parseSlashCommand` (`:37-47`) and listed by `getSlashCommandSuggestions` (`:49-57`), which only
  ever filters this fixed array — no merge point with a server-provided list exists.
  `executeSlashCommand` (`apps/web/src/utils/executeSlashCommand.ts:28-109`) special-cases each of
  the four names directly (`me` formats client-side; `poll`, `nick`, `invite` call existing REST
  endpoints) — there is no generic "dispatch to whoever owns this command" branch to hook a bot
  into; one must be added.
- **Rate limiting building blocks reused**: `RedisFixedWindowLimiter` (used by `BotAuthGuard` and
  the per-bot send limiter, `bot-auth.guard.ts:61-65`, `bot-api.controller.ts:69-73`) and the
  Socket.IO connection/event guards in `attachSocketGuards`
  (`apps/api/src/modules/realtime/socket-guards.ts:30-88`, per-IP connect attempts and per-subject
  event rate, keyed by `socketLimitSubject` which falls back to `socket:<id>` for an unauthenticated
  socket, `socket-guards.ts:17-20`).
- **Redis multi-instance model**: the gateway already runs behind the Socket.IO Redis adapter
  (`realtime.gateway.ts:56-58`) and `RealtimePublisher` addresses rooms/users across instances via
  `server.to(room)` / `server.in(...)` (`realtime-publisher.service.ts:13-50`) — a bot's rooms are
  addressed the same way, no new cross-instance mechanism needed.

## Changes

### Gateway (phase 2)

**Auth.** `SocketAuthService.authenticate` gains a bot branch, tried when the handshake carries
`Authorization: Bot <token>` (mirroring the REST header, not the human `auth.token`/`Bearer <jwt>`
forms it already reads) or `handshake.auth.botToken`. It calls the same `parseBotToken` +
`secretTokenMatches` pair `BotAuthGuard` uses (`bot-token.ts`, `common/secret-token.ts`) against the
`Bot` table, rejects on owner-deletion-pending exactly like the guard does, and returns a new
discriminated `SocketUser` shape:

```ts
export type SocketUser =
  | { kind: 'human'; id: string; sessionId: string }
  | { kind: 'bot'; id: string; botId: string };
```

`readSocketUser`/`setSocketUser`/`getSocketUser` (`socket-user.ts`) stay signature-compatible;
every existing call site that assumes a human socket (`realtime.gateway.ts`,
`messages.gateway.ts`, `voice.gateway.ts`, `presence.service.ts`) is updated to check `kind` and
either skip bot-specific work or throw `UnauthorizedException` for an event a bot must never reach
(see below) — this is the actual code-side work; this doc's job is only to pin the contract.

**Room membership**, computed once at connect and kept live afterwards:

- A bot socket joins `serverRoom(serverId)` for every server the bot's `ServerMember` row is in
  (`RealtimeAccessService.listServerIds(bot.userId)`, already exists and is identity-agnostic since
  it queries by user id — reused unchanged) and `channelRoom(channelId)` for every channel where
  `hasChannelPermission(bot.userId, channelId, Permission.ViewChannel)` is true, computed the same
  way `ServersService.listForUser` already filters channels for the bot-REST `GET /bot-api/servers`
  response (`servers.service.ts:61-68`) — reusing `PermissionsService.filterViewableChannels` rather
  than inventing a second viewability query.
- A bot socket does **not** join `userRoom(bot.userId)` (no DMs, no personal-notification stream —
  a bot has no notification preferences) and does not run `joinDirectConversationRooms`
  (`realtime.gateway.ts:91,111-118`) at all, since `listConversationIds` for a bot user is always
  empty in practice (bots cannot be added to a DM) but the call is skipped explicitly for clarity
  and one fewer query per connect.
- A bot socket is **not** added to `PresenceService`'s online-users tracking
  (`presence.service.ts:27-46`): no `presence:update` is emitted for a bot connecting/disconnecting,
  and a bot is never shown as "online" in a member list — a bot's row already carries no live
  presence semantics in phase 1 (`bot-api.md`'s "Unread and mention events for a bot are emitted to
  a room nobody joins"). `PresenceService.socketConnected`/`socketDisconnected` are simply not
  called from the bot branch of `handleConnection`/`handleDisconnect`.

**Events a bot socket receives** (fixed allowlist, broadcast the same way to every room member —
no gateway-side filtering per recipient kind beyond room membership):

| Event                                                   | Why included                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `message:created`, `message:updated`, `message:deleted` | Core use case: a bot reacts to channel messages.                                                                                     |
| `reaction:updated`                                      | A bot may react to reactions (e.g. a poll-closing bot).                                                                              |
| `server:member-removed`, `server:member-updated`        | A bot needs to know its own removal/role change live (see Disconnect below) and can track membership for moderation-style bots.      |
| `channel:join`/`channel:leave` acks                     | Not applicable — these are request/response on the bot's own join call, not broadcast; listed for completeness, not a new broadcast. |
| `interaction:create`                                    | Phase 3, delivered only to the owning bot's socket (targeted emit, not a room broadcast — see Slash commands).                       |

**Events a bot socket must NOT receive**, enforced by never joining the room that carries them
rather than by a per-event filter:

- Any DM/conversation event (`dm:*`, `conversation:join` ack) — no conversation room join.
- `presence:update` — bots never join a server's presence stream as a _subscriber_ either, since
  presence is broadcast to `serverRoom(serverId)` (`presence.service.ts:129-133`) and a bot **is** a
  member of that room for message events. This is an accepted, explicit exception: a bot's socket
  receives `presence:update` for humans in its shared servers, because splitting presence onto a
  second room per server (human-only) to hide it from bots is not worth the added room-management
  complexity for a payload (`{ userId, status }`) that carries no PII beyond what `GET
/bot-api/servers` members already expose. This is called out explicitly rather than silently
  allowed — see Open Questions.
- `typing:start`/`typing:stop` — broadcast to `channelRoom` (`messages.gateway.ts:186,200`), which a
  bot **does** join for view-permission reasons above. Same accepted-exception note as presence: a
  bot sees typing indicators in channels it can view. Both are read-only, low-sensitivity signals;
  neither reveals anything the bot cannot already read over REST.
- All `voice:*`, `webrtc:*`, `soundboard:*` events — a bot never joins a voice/call room because it
  never emits `voice:join` (writes stay on REST/nothing, per Scope) and is never added to
  `CallRegistryService`'s tracked participants.
- `friend:*`, `notification:*`, `scheduled-message:updated`, `poll:updated` outside a viewable
  channel — a bot only ever joins server/channel rooms, so these reach it only when they are
  legitimately broadcast to a channel/server room the bot is already in (e.g. `poll:updated` in a
  channel it can view is fine, matching what `GET /bot-api/channels/:id/messages` would show it
  anyway).

**Fixed allowlist vs. intents.** No opt-in "intents" bitmask is introduced. Recommendation: fixed
set, because (a) phase 1 already fixed the bot's read surface to "whatever REST allowlist exists"
with no per-bot configuration, so an intents system would be the first configurable-scope concept in
the whole bot API and adds a registration UI, a stored bitmask, and a second surface to validate
against permissions for no user-visible benefit yet; (b) every event above is already something the
bot's REST allowlist can already read or infer (messages, reactions, membership) — there is no
narrower slice request-per-bot Discord itself only introduced after years of bot-store abuse
concerns, which this repo does not have (no public bot directory exists, `bot-api.md` phase 4+).
Revisit if/when phase 4 adds public bot listing.

**Bot sockets are receive-only** except one write: the Socket.IO built-in heartbeat/ping the
transport itself handles, plus the existing `channel:join` acknowledgment call **is explicitly
disallowed for a bot** (a bot's channel rooms are computed once at connect from its full viewable
set, not joined on demand, because a bot has no "currently open channel" concept the way a human
client does). Every other `@SubscribeMessage` handler (`message:create`, `message:update`,
`reaction:toggle`, `typing:start`, `unread:get`, ...) throws `UnauthorizedException('Bot sockets are
receive-only')` for a `kind: 'bot'` socket user, enforced by a shared guard check added at the top
of each handler (or a class-level guard on `MessagesGateway`/`VoiceGateway` that inspects
`getSocketUser(client).kind`). **Why**: keeping every write on REST means the phase-1 permission
checks, the `/bot-api/*` allowlist, `BOT_MESSAGES_PER_MINUTE`, and AutoMod all stay the single path
a bot write goes through — a bot cannot bypass any of them by finding a socket event that skips the
same validation, and this doc introduces no second, weaker write path to keep in sync.

**Rate limits and connection caps per bot**:

- **Connection cap**: a bot may hold at most `BOT_GATEWAY_MAX_CONNECTIONS` (recommended: 1) live
  socket at a time. A second connection attempt with the same bot token disconnects the older
  socket(s) rather than refusing the new one — matches "a bot process reconnecting after a crash
  should win," not "the bot operator must manually clean up." One connection is enough for phase 2/3
  (no per-shard sharding is in scope) and avoids a bot's crash-loop opening unbounded sockets.
  **Implemented differently than first drafted here** — see Deviations: every bot socket joins its own
  Socket.IO room (`botRoom(botId)`, `bot:<botId>`) instead of a separate Redis registry keyed by
  `{instanceId, socketId}`; the Redis adapter's remote-socket selectors (`server.in(room)`) already
  reach a socket on any instance, the same way `RealtimePublisher.disconnectSessions` finds a human's
  sockets via `userRoom`.
- **Connect attempts**: reuses the existing per-IP `SOCKET_CONNECTS_PER_MINUTE` (30/min,
  `socket-guards.ts:7,44-49`) unchanged — a bot host is an IP like any other.
- **Gateway event budget**: reuses the existing per-subject `SOCKET_EVENTS_PER_MINUTE` (300/min,
  `socket-guards.ts:8,69-81`); `socketLimitSubject` is extended to key on `bot:<botId>` for a bot
  socket instead of `user:<id>`, so a bot's inbound event volume (heartbeats only, per the
  receive-only rule above) is capped independently of a human sharing the same box.
- No new bot-specific gateway rate limit constant is needed beyond the connection cap, because a
  receive-only socket cannot generate meaningful inbound load beyond what the transport itself sends.

**Behaviour on removal / token regeneration** (live, not "next reconnect"):

- **Removed from a server** (`DELETE /servers/:serverId/bots/:botId`, a kick/ban through
  `ServerModerationService`, `deleteBotWithMemberships`, or owner account deletion): **confirmed by
  reading every removal path** (was "inferred, not verified" in this doc's first draft) — all four
  already call `RealtimePublisher.emitToRoom(serverRoom(serverId), 'server:member-removed', ...)`
  before this change (`bot-authorization.service.ts`'s `removeFromServer`/`announceRemoval`,
  `server-moderation.service.ts`'s `kick`/`ban`, `bots.service.ts`'s `remove`, and
  `account-deletion.service.ts`'s sweep). This change adds the socket-side effect next to each: for a
  bot, the shared helper `syncBotGatewayOnRemoval` (`bots/bot-gateway-sync.ts`) looks up its live
  socket via `botRoom(botId)` and calls `server.in(botRoom(botId)).socketsLeave([serverRoom(serverId),
...thatServer'sChannelRooms])` rather than a full disconnect — the bot stays connected for its other
  servers. If that removal was the bot's last server, the socket is fully disconnected instead
  (`disconnectBotSocket`). The full-bot-deletion paths (`BotsService.remove`,
  `AccountDeletionService`'s sweep) call `disconnectBotSocket` directly instead of through the shared
  helper, because the `Bot` row is already gone by the time the disconnect runs and the helper's own
  lookup would miss.
- **Token regenerated** (`POST /bots/:botId/regenerate-token`): the old token must stop working
  immediately for the gateway the same way it already does for `/bot-api/*`. The bot's live socket
  (if any, found via `botRoom(botId)`) is disconnected outright
  (`server.in(botRoom(botId)).disconnectSockets(true)`) — the bot process must reconnect with the new
  token. This is a full disconnect, not a room removal, since a regenerated token is a full identity
  change in the current auth model.
- **Bot deleted**: `BotsService.remove` calls `disconnectBotSocket` right after
  `deleteBotWithMemberships` commits. **Owner requests account deletion**: not gated on the grace
  period the way `BotAuthGuard` already gates `/bot-api/*` (`bot-api.md:182-183`) — a bot's gateway
  socket is untouched while deletion is only _pending_, since a pending request is reversible and REST
  calls already stop working during the grace period regardless of the socket's state. Once the grace
  period elapses and anonymization actually deletes the bot, `AccountDeletionService`'s sweep calls
  `disconnectBotSocket` for each removed bot, same as `BotsService.remove`.

### Slash command registry (phase 3)

**Data model** — per-server, per-bot registration (not global-per-bot in phase 3; see Scope):

```prisma
model SlashCommand {
  id          String   @id @default(cuid())
  botId       String
  serverId    String
  name        String   // matches BOT_NAME_PATTERN-adjacent slug rule below
  description String
  // Options are declared, not free text; kept intentionally small (string/integer/boolean/user/channel),
  // matching the composer's plain-text invocation model, not a full Discord-style option tree.
  options     Json     @default("[]")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  bot    Bot    @relation(fields: [botId], references: [id], onDelete: Cascade)
  server Server @relation(fields: [serverId], references: [id], onDelete: Cascade)

  @@unique([serverId, name])
  @@index([botId])
}

model Interaction {
  id            String   @id @default(cuid())
  token         String   @unique
  commandId     String
  botId         String
  serverId      String
  channelId     String
  invokerUserId String
  args          Json
  status        InteractionStatus @default(PENDING)
  createdAt     DateTime @default(now())
  respondedAt   DateTime?

  command SlashCommand @relation(fields: [commandId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([botId, status])
}

enum InteractionStatus {
  PENDING
  RESPONDED
  TIMED_OUT
}
```

- **Limits**: `SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER` (recommended: 25, matching Discord's
  per-guild-per-app ballpark without copying it verbatim) and `SLASH_COMMAND_OPTIONS_MAX` (25 like a
  channel's existing list caps elsewhere in this repo — no direct precedent found, **inferred, not
  verified**, flagged in Open Questions). `name` follows a slug rule distinct from `BOT_NAME_PATTERN`
  (that pattern is for the bot's _display_ name and allows spaces): `^[a-z][a-z0-9_-]{0,31}$`,
  matching Discord's own command-name shape and the fact `parseSlashCommand` already lowercases and
  splits on whitespace (`slashCommands.ts:39-40`), so a command name can never contain a space.
- **Registration endpoint**, added to the existing `/bot-api/*` allowlist (`BotApiController`):

  | Method   | Path                                             | Body                              | Response                                                                    |
  | -------- | ------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------- |
  | `GET`    | `/bot-api/servers/:serverId/commands`            | —                                 | `{ commands: SlashCommandView[] }` (this bot's own commands in that server) |
  | `POST`   | `/bot-api/servers/:serverId/commands`            | `{ name, description, options? }` | `201 { command }`                                                           |
  | `PATCH`  | `/bot-api/servers/:serverId/commands/:commandId` | `{ description?, options? }`      | `{ command }` (name is immutable; delete + recreate to rename)              |
  | `DELETE` | `/bot-api/servers/:serverId/commands/:commandId` | —                                 | `{ ok: true }`                                                              |

  All four require the bot to already be a member of `:serverId` (`404 Bot is not a member of this
server` otherwise, same shape as the existing `404`s in `bot-api.md`'s authorize checks) — a bot
  cannot pre-register commands into a server it has not been authorized into.

- **Name collision rules**:
  - Against the 4 built-ins (`me`, `nick`, `poll`, `invite`,
    `apps/web/src/utils/slashCommands.ts:10-24`): a bot **cannot** register any of those names,
    server-wide, in any server — `409 Command name is reserved` at registration time. Built-ins
    always win and are never shadowed, because they are safety/utility commands every server relies
    on regardless of which bots are installed.
  - Between bots in the same server: `@@unique([serverId, name])` enforces first-registered-wins;
    a second bot's attempt to register the same name in the same server returns
    `409 Command name already used in this server`. No priority/override system — simple first-come,
    matching the "one registrant, one 409" pattern the phase-1 doc already uses for
    `409 Bot already in this server`.
  - The same bot registering the same name twice in the same server hits the same unique constraint;
    treated identically (`409`), not as an implicit update — `PATCH` is the update path.
- **Permission to see/use a command**: a server command appears in the composer's suggestions only
  when the viewer has `Permission.ViewChannel` **and** `Permission.SendMessages` on the active
  channel (reusing `PermissionsService.hasChannelPermission`, the same pair `bot-api.md`'s send path
  already checks) — no separate "default member permission" bitmask per command in phase 3, because
  a server already controls this per-channel via roles, and adding a second permission layer on top
  of the channel's own would duplicate `RolesService`'s model for no case this repo's role system
  cannot already express (a moderator-only bot command → put it in a moderator-only channel, or gate
  it in the bot's own logic once it receives the interaction and can re-check the invoker's roles
  via `GET /bot-api/servers`). This is a explicit simplification, not an oversight — flagged in Open
  Questions as the one place Discord's model (`default_member_permissions`) is knowingly not matched.
- **i18n**: the built-in composer strings (suggestion list labels, "The application did not
  respond", timeout/offline notices) are new catalog keys under `chat.ts` in both
  `apps/web/src/i18n/locales/en/` and `.../vi/`, following the existing `slash.*` key convention
  (`slash.error.unknown` etc., `chat.ts:153-163`) — e.g. `slash.error.commandReserved`,
  `slash.interaction.noResponse`, `slash.interaction.timeout`. A bot's own `name`/`description` are
  operator-supplied strings, not localized (same as a bot's display name today) and are rendered
  as-is; `npm run i18n:check` only needs to pass for the new catalog keys, not for
  bot-registered text.

### Invocation flow (phase 3)

1. **Composer suggestions**: `getSlashCommandSuggestions` (`slashCommands.ts:49-57`) is extended to
   accept an optional `serverCommands: SlashCommandDefinition[]` parameter (fetched once per active
   server via the existing server-detail load, similar to how roles are already fetched for
   `ServerSettings`) and concatenates them with `SLASH_COMMANDS` before filtering/sorting — the
   built-ins keep their existing `owner: 'client' | 'server'` discriminant; a bot command gets a
   third discriminant `owner: 'bot'` carrying `{ botId, commandId }` so `parseSlashCommand` and
   `executeSlashCommand` can route it.
2. **Invoke**: `executeSlashCommand` (`executeSlashCommand.ts:28-109`) gains a branch: when
   `command.definition.owner === 'bot'`, it calls a new REST endpoint instead of any of the existing
   inline special cases:

   `POST /channels/:channelId/interactions` (session auth, existing `JwtAuthGuard`, **not**
   `/bot-api/*` — the _invoker_ is a human member, not a bot) with body
   `{ commandId, args: string }`.

   REST, not socket, for the invoke call: the composer already sends every other action (`poll`,
   `nick`, `invite`) via `apiRequest` (`executeSlashCommand.ts:68-105`), so the invoke call follows
   the same pattern as its siblings rather than introducing the first socket-emitted write from a
   human client for this one feature.

3. **API validates** the invoker has `SendMessages`+`ViewChannel` on `:channelId` (existing
   `MessagesService`/`PermissionsService` checks, reused, not reinvented), that `commandId` belongs
   to that channel's server, and that its declared `options` schema is satisfied by `args` (parsed
   the same lightweight way `parsePollCommand` parses `/poll` args today, `parsePollCommand`
   referenced by `executeSlashCommand.ts:62`, not `parseSlashCommand` itself which only extracts the
   raw args string) — a validation failure returns `400` with a field-level reason, surfaced by the
   composer the same way `poll`'s `errorKey`/`errorVars` are today (`executeSlashCommand.ts:63-66`).
4. **API creates an `Interaction` row** (`status: PENDING`, `token` = a `generateSecretToken()`
   value reusing `common/secret-token.ts` — the same helper bot tokens and webhook tokens already
   use) with a TTL of `INTERACTION_TIMEOUT_MS` (recommended: 15 000 ms, Discord's own initial-response
   deadline) and responds `201 { interactionToken }` to the invoker's REST call immediately — the
   HTTP call to `/interactions` does **not** block on the bot's answer; the composer shows a
   "waiting for {botName}…" placeholder (new, ephemeral-to-the-invoker-only UI state, not a real
   message) until the callback lands or the deadline passes.
5. **API emits `interaction:create`** to the bot's gateway socket only (targeted emit via
   `RealtimePublisher.emitToRoom(botRoom(botId), ...)` from Gateway above — not a room broadcast,
   since only the owning bot may ever see it, and an empty room is a harmless no-op) with
   `{ interactionToken, commandName, args, channelId, serverId, invoker: {
id, username, displayName } }`. If the bot has no live socket, the API can already tell
   immediately (empty room) and can either wait out the TTL anyway (simplicity: one path handles
   both "briefly disconnected, might reconnect" and "not connected at all") or fail fast. Chosen:
   **wait out the TTL** — a bot reconnecting inside the 15 s window (e.g. deploy restart) still
   answers successfully, and the failure UI is identical either way (see Edge cases table).
6. **Bot responds**: `POST /bot-api/interactions/:interactionToken/callback` (bot-token auth, added
   to the phase-1 allowlist) with `{ content, replyToMessageId? }` — same shape as
   `BotCreateMessageDto` (`dto/bot-create-message.dto.ts`, not re-read line-by-line here but its
   shape is already documented in `bot-api.md`'s allowlist table) — the callback body is
   intentionally identical to the existing bot message-create body so `BotMessagesService` logic is
   reused, not duplicated: the handler resolves the `Interaction` by token, checks `status ===
PENDING` and `Date.now() < createdAt + TTL`, calls the same `MessagesService.createMessage` path
   `BotMessagesService.createMessage` already uses (`bot-messages.service.ts:37-60`), marks
   `status: RESPONDED, respondedAt: now`, and returns the created message — **response is public in
   the channel** the interaction was invoked in; ephemeral is out of scope (see Scope).
7. **Timeout**: a scheduled sweep (reusing the pattern of `PresenceService.sweepStaleUsers`'s
   periodic job, not a new job framework) flips any `PENDING` interaction past its TTL to
   `TIMED_OUT` and emits a targeted notice to the invoker
   (`RealtimePublisher.emitToRoom(userRoom(invokerUserId), 'interaction:timeout', {
interactionToken })`) so the composer replaces its "waiting…" placeholder with
   `slash.interaction.noResponse` ("The application did not respond."). The callback endpoint also
   rejects a late response (`409 Interaction already timed out`) so a slow bot cannot post after the
   invoker has already been told it failed.
8. **Idempotency**: the callback endpoint is naturally idempotent by the `status === PENDING` guard
   — a retried callback (e.g. the bot's own HTTP client retries on a network blip) after the first
   one already flipped the row to `RESPONDED` returns `409 Interaction already responded to`, never
   posts a second message. This mirrors the "conditional `UPDATE ... WHERE <still-valid>`" pattern
   `rules/backend-nestjs.md` requires for read-modify-write races: the update is
   `UPDATE "Interaction" SET status = 'RESPONDED' WHERE id = $1 AND status = 'PENDING'`, and the
   handler checks the affected-row count before creating the message.

### Edge cases

| Case                                                                    | Expected behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot offline when a slash command is invoked                             | `interaction:create` has no live socket to reach; the `Interaction` still gets created and waits out the TTL, then times out exactly like a bot that connected but never answered — invoker sees "The application did not respond."                                                                                                                                                                                                                                                                             |
| Bot removed from the server mid-flight (between invoke and callback)    | The callback's `commandId` lookup still resolves (the `SlashCommand` row is not deleted by a membership removal, only by bot/command deletion or server removal cascade), but `BotAuthGuard`/`BotMessagesService`'s underlying `createMessage` call now fails `SEND_MESSAGES`/membership check the same way any bot REST call would after removal — the callback returns the same `403` a normal bot send would, and the interaction is left `PENDING` until it times out (no special-cased success-path here). |
| Bot's token regenerated mid-flight                                      | The gateway socket holding the old identity is disconnected (Gateway → Disconnect), so `interaction:create` was already undeliverable if regeneration happened before step 5; if it happened after delivery but before the callback, the callback call itself now fails `BotAuthGuard` with the old token (`401 Invalid bot token`) — same as any other in-flight bot REST call across a regeneration, an accepted pre-existing risk class per `bot-api.md`'s own token-has-no-expiry risk note.                |
| Invoker lacks `SendMessages` on the channel at invoke time              | `403` at step 3, same message a human's own `/poll` or plain message send would get; no `Interaction` row created.                                                                                                                                                                                                                                                                                                                                                                                              |
| Unauthorized channel (invoker can `ViewChannel` but not `SendMessages`) | Command does not even appear in the composer's suggestions (Registry → permission to use), and a direct API call still gets `403` server-side — never trust the client-side suggestion filter alone.                                                                                                                                                                                                                                                                                                            |
| Option validation failure (missing required option, wrong type)         | `400` with the failing option's name, shown inline the same way `parsePollCommand`'s `errorKey`/`errorVars` are surfaced today.                                                                                                                                                                                                                                                                                                                                                                                 |
| Duplicate command name (built-in or same-server bot)                    | `409` at registration time (Registry → collision rules); never silently overwrites.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Interaction token reused/retried                                        | `409 Interaction already responded to` (idempotency, step 8).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bot socket at its connection cap, second process connects               | Older socket is disconnected (Gateway → connection cap); a slash command in flight to the old socket is not redelivered to the new one — it simply times out if the old socket's disconnect happened before its callback landed, same as any other offline case.                                                                                                                                                                                                                                                |

## Technical Approach

**Files touched**

| File                                                                                                                                                            | Change                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/realtime/socket-user.ts`                                                                                                                  | `SocketUser` becomes a discriminated union (`kind: 'human' \| 'bot'`).                                                                                                                                   |
| `apps/api/src/modules/realtime/socket-auth.service.ts`                                                                                                          | Add the bot-token branch, reusing `parseBotToken`/`secretTokenMatches`.                                                                                                                                  |
| `apps/api/src/modules/realtime/realtime.gateway.ts`                                                                                                             | Branch `handleConnection`/`handleDisconnect` on socket kind: bot room joins, skip presence/DM rooms, join `botRoom(botId)` (see Deviations — replaces the `bot-sockets:<botId>` registry sketched here). |
| `apps/api/src/modules/realtime/realtime-access.service.ts`                                                                                                      | Add `listViewableChannelIds(botUserId)` (or reuse `filterViewableChannels`) for bot room computation.                                                                                                    |
| `apps/api/src/modules/realtime/messages.gateway.ts`, `voice.gateway.ts`                                                                                         | Add the receive-only guard for `kind: 'bot'` sockets.                                                                                                                                                    |
| `apps/api/src/modules/realtime/socket-guards.ts`                                                                                                                | `socketLimitSubject` keys on `bot:<botId>` for a bot socket.                                                                                                                                             |
| `apps/api/src/modules/realtime/realtime-publisher.service.ts`                                                                                                   | Add `disconnectBotSocket(botId)` / `removeBotFromRooms(botId, rooms)` alongside the existing `disconnectSessions`.                                                                                       |
| `apps/api/src/modules/bots/bot-memberships.ts`, `bots.service.ts`                                                                                               | Call the new disconnect/room-leave helpers on removal, token regeneration, deletion.                                                                                                                     |
| `apps/api/src/modules/bots/bot-api.controller.ts`                                                                                                               | Add the 4 command-registry routes and the interaction callback route.                                                                                                                                    |
| `apps/api/src/modules/bots/` (new) `slash-commands.service.ts`, `interactions.service.ts`, `dto/create-slash-command.dto.ts`, `dto/interaction-callback.dto.ts` | New services/DTOs for registry + interaction lifecycle.                                                                                                                                                  |
| `apps/api/src/modules/messages/` (new) `interactions.controller.ts` or extended `channels.controller.ts`                                                        | `POST /channels/:channelId/interactions` (session-auth invoke).                                                                                                                                          |
| `apps/api/src/modules/realtime/interaction-timeout.service.ts` (new)                                                                                            | Scheduled sweep for `PENDING` → `TIMED_OUT`, mirroring `PresenceService.sweepStaleUsers`'s job pattern.                                                                                                  |
| `apps/api/prisma/models/bots.prisma`                                                                                                                            | Add `SlashCommand`, `Interaction`, `InteractionStatus`.                                                                                                                                                  |
| `packages/shared/src/bots.ts`                                                                                                                                   | Add `SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER`, `SLASH_COMMAND_OPTIONS_MAX`, `BOT_GATEWAY_MAX_CONNECTIONS`, `INTERACTION_TIMEOUT_MS`, `SlashCommandView`, `SlashCommandOption` types.                       |
| `packages/shared/src/realtime-events.ts`                                                                                                                        | Add `InteractionCreate: 'interaction:create'`, `InteractionTimeout: 'interaction:timeout'`.                                                                                                              |
| `apps/web/src/utils/slashCommands.ts`                                                                                                                           | `SlashCommandDefinition.owner` gains `'bot'`; `getSlashCommandSuggestions` accepts server commands.                                                                                                      |
| `apps/web/src/utils/executeSlashCommand.ts`                                                                                                                     | Add the `owner === 'bot'` branch calling the invoke endpoint and rendering the waiting/timeout state.                                                                                                    |
| `apps/web/src/api.ts`, a new `hooks/useSlashCommandInvocation.ts`                                                                                               | Invoke call, waiting-state, `interaction:timeout` listener wiring into `useRealtimeSocket.ts`.                                                                                                           |
| `apps/web/src/i18n/locales/{en,vi}/chat.ts`                                                                                                                     | New `slash.*` keys for reserved-name errors, waiting/timeout copy.                                                                                                                                       |

**API contract**

- `POST /bot-api/servers/:serverId/commands` → `201 { command: SlashCommandView }`; `404` bot not a
  member; `409` reserved/duplicate name; `400` invalid options schema.
- `GET /bot-api/servers/:serverId/commands` → `{ commands: SlashCommandView[] }`.
- `PATCH /bot-api/servers/:serverId/commands/:commandId` → `{ command }`; `404` unknown command.
- `DELETE /bot-api/servers/:serverId/commands/:commandId` → `{ ok: true }`.
- `POST /channels/:channelId/interactions` (session auth) → `201 { interactionToken }`; `400`
  option validation; `403` missing `SendMessages`/`ViewChannel`; `404` unknown command in this
  server's channel.
- `POST /bot-api/interactions/:interactionToken/callback` (bot-token auth) → `{ message }`
  (same shape as `POST /bot-api/channels/:channelId/messages`); `404` unknown token; `403` token
  belongs to a different bot; `409` already responded / already timed out.

**DB / migration**

- New tables `SlashCommand`, `Interaction`; new enum `InteractionStatus`. Both nullable-free/new
  tables — no existing column changes, no backfill.
- Migration name: `20260918002000_add_slash_commands_and_interactions` (after the
  `20260918000000`–`20260918001999` range reserved by the doc in flight per the task brief; after
  `20260917014000_add_stickers_and_soundboard`, the latest one currently in the repo).
- No lock risk: both tables start empty; `@@unique([serverId, name])` is checked at insert time only.

**Libraries** — no new dependency. Reuses `socket.io` (already a dependency, `realtime.gateway.ts`),
`@socket.io/redis-adapter` (already used), `ioredis`-backed `RedisFixedWindowLimiter` (already
used for `BotAuthGuard` and the send limiter), and `common/secret-token.ts`'s existing token
helpers.

## Trade-offs

| Option                                             | Pros                                                                                                                                                                                                                                | Cons                                                                                                                                                                                                                                                                                                                                                                                                       | Verdict                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gateway delivery for slash commands (chosen)**   | One transport for every bot interaction (already required for phase 2 events); no outbound HTTP from the API, so no SSRF surface, no bot-hosted-webhook-endpoint config, no retry/backoff design for a call _to_ a third party.     | The bot must stay connected to receive commands — an offline bot cannot answer, unlike an HTTP-callback model where the platform can retry the callback itself.                                                                                                                                                                                                                                            | Chosen — this is the explicit user decision (2026-09-18) recorded at the top of this doc; also consistent with `bot-api.md`'s own phase-2 framing of the gateway as the missing piece.                                                                                                                                                                |
| HTTP callback URL per bot (Discord's actual model) | Bot need not stay connected; the platform can retry with backoff.                                                                                                                                                                   | Requires the API to make outbound calls to arbitrary bot-hosted URLs — a new SSRF class (`integrations.md`'s "never trust the declared schema," `security.md`'s webhook-receiving rules do not cover _sending_), needs its own signature scheme, timeout, and retry-cap design, and this repo already treats outbound webhook-shaped concerns as their own doc (`incoming-webhooks.md` is _inbound_ only). | Ruled out per the explicit user decision; would also roughly double this doc's Risk surface for a repo with no existing outbound-call precedent.                                                                                                                                                                                                      |
| Fixed gateway event allowlist (chosen)             | Zero new configuration surface; every event is already something a bot's REST allowlist can read.                                                                                                                                   | A bot that only cares about, say, reactions still receives message events too — slightly wasteful bandwidth, no functional harm since writes are receive-only and idempotent.                                                                                                                                                                                                                              | Chosen — see Changes → Gateway → "Fixed allowlist vs. intents."                                                                                                                                                                                                                                                                                       |
| Discord-style intents bitmask                      | Bots opt into only what they need; smaller payload footprint at scale.                                                                                                                                                              | New registration field, new stored state, new validation surface, no current abuse/scale pressure justifying it (no public bot directory yet).                                                                                                                                                                                                                                                             | Ruled out for phase 2/3; revisit at phase 4 (public bot listing) per `bot-api.md`.                                                                                                                                                                                                                                                                    |
| Per-server slash command registration (chosen)     | Matches `SlashCommand.@@unique([serverId, name])`'s natural collision boundary; a bot can offer different commands per server if it wants; simplest permission story (registration already requires bot membership in that server). | A bot installed in 50 servers must register the same command 50 times.                                                                                                                                                                                                                                                                                                                                     | Chosen for phase 3; a global-per-bot registration option (register once, apply everywhere the bot is installed) is deferred — see Open Questions, since it changes the collision-check surface (global name vs. per-server) and is easy to add later without a breaking migration (`SlashCommand.serverId` could become nullable for a "global" row). |
| Ephemeral (invoker-only) interaction responses     | Matches Discord's most common bot UX (command output visible only to the invoker).                                                                                                                                                  | The web client has no per-user-only message rendering path today — every message in a channel is visible to every viewer of that channel's history; building one is a UI/data-model project of its own (would need a message visibility scope, not just a flag), out of proportion to this doc.                                                                                                            | Ruled out for phase 2/3, explicit Scope exclusion; phase 4+ if ever prioritized.                                                                                                                                                                                                                                                                      |

What the chosen option costs: a bot must run a persistent process (not a stateless HTTP-only
service) to answer commands at all — this is a deliberate trade against Discord's own retry-capable
callback model, accepted because it removes an entire outbound-call risk category from a repo that
has never made an outbound call to third-party-controlled infrastructure before. Maintenance cost:
every gateway broadcast path (`RealtimePublisher`) must now be reviewed for "does a bot socket sit
in this room and should it," a new category of review `security-check.md`'s Socket.IO section
(referenced, not fully re-read for this doc) should absorb.

## Deviations From The Original Design

Written back after implementing the API/shared/realtime parts (web/composer integration is a
follow-up, tracked at the end of this section), so the doc matches the code:

- **Composer command list**: `GET /servers/:serverId` returns `server.slashCommands: SlashCommandView[]`
  (`ServerDetail` in `packages/shared/src/api-contract.ts`), as Invocation flow step 1 planned. It
  lists only commands whose bot is still a member, because removing a bot from a server keeps its
  registrations (`apps/api/prisma/models/bots.prisma`, `SlashCommand` comment). The per-channel
  `ViewChannel` + `SendMessages` filter stays in the composer; the invoke route re-checks it.

- **No `bot-sockets:<botId>` Redis registry.** Every bot socket instead joins a Socket.IO room of its
  own, `botRoom(botId)` = `bot:<botId>` (`realtime-publisher.service.ts`), mirroring the existing
  `userRoom(userId)` pattern. The Redis adapter's remote-socket selectors (`server.in(room)`) already
  reach a socket held by any instance, so a room accomplishes everything the registry sketch was for —
  connection-cap enforcement (`fetchBotSockets`), targeted `interaction:create` delivery
  (`emitToRoom(botRoom(botId), ...)`), live room removal on a partial removal
  (`removeBotFromRooms` → `socketsLeave`), and a full disconnect on token regeneration/deletion
  (`disconnectBotSocket` → `disconnectSockets(true)`). This is simpler (no second store to keep in
  sync, nothing to expire) and removes the staleness risk the registry sketch had — see Risks.
- **`syncBotGatewayOnRemoval` (`bots/bot-gateway-sync.ts`) is a new shared helper**, not folded into
  `BotAuthorizationService` alone, because a bot can also be removed by a plain kick/ban
  (`ServerModerationService.kick`/`ban`, which already accepts `BOT` members per `bot-api.md`'s
  Deviations) — a path this doc's first draft did not call out as needing the same live-socket
  side effect. `server-moderation.service.ts`'s existing `announceRemoval` now calls the same helper.
- **No separate `dto/interaction-callback.dto.ts`.** The callback body is byte-identical to
  `BotCreateMessageDto` (as this doc's own Invocation-flow step 6 already says), so
  `BotApiController`'s callback route and `InteractionsService.respondToCallback` reuse that DTO
  class directly instead of duplicating its validation rules in a second file that could drift.
- **`InteractionsController` lives in `apps/api/src/modules/bots/`, not `modules/messages/`** (the
  Technical Approach table's original suggestion) — it depends on `SlashCommand`/`Interaction`
  (bots-domain models) more than on anything internal to `MessagesModule`, and `BotsModule` already
  imports `PermissionsModule`/`RealtimePublisherModule`/`MessagesModule`, so no new module wiring was
  needed. It still uses `JwtAuthGuard` (session auth), never `BotAuthGuard`, exactly as designed.
- **The callback's claim-then-send order, made explicit.** Step 8's "conditional `UPDATE` … before
  creating the message" was underspecified for the failure path: if `BotMessagesService.createMessage`
  then throws (e.g. the bot was removed from the server between invoke and callback, Edge cases → "Bot
  removed mid-flight"), `InteractionsService.respondToCallback` reverts the claim
  (`RESPONDED` → `PENDING`) before rethrowing, so the interaction still times out normally instead of
  being stuck `RESPONDED` with nothing posted. Two callbacks racing for the same token still can never
  both post: the loser's claim `updateMany` affects zero rows before either one calls `createMessage`.
- **No `Interaction.token` index beyond its own `@@unique`.** The doc's Prisma sketch listed
  `@@index([token])` alongside `@@unique([token])`; Postgres already indexes a unique constraint, so
  the extra index would have been redundant. Dropped; `@@index([botId, status])` (used by nothing yet
  but kept for a future admin/debug listing) is unchanged.
- **`INTERACTION_TIMEOUT_MS` deadline is measured from `Interaction.createdAt`**, not from a separate
  "delivered at" timestamp — there is no such column, and the doc's own step 5 already treats "no live
  socket" and "briefly disconnected" as the same case, so the deadline needing to start no later than
  creation was already implied.
- **Owner-account-deletion grace period does not disconnect an already-open bot socket** (only
  `/bot-api/*` REST calls are refused during the grace period, matching `BotAuthGuard`). A _new_
  connection attempt during the grace period is refused by `SocketAuthService`'s bot branch (same
  `deletionRequestedAt` check `BotAuthGuard` makes), but an existing socket opened before the deletion
  request stays connected until the grace period elapses and anonymization actually deletes the bot
  (which does call `disconnectBotSocket`) — a pending, reversible request does not need to interrupt a
  socket the same way an executed deletion does.
- **Resolved "inferred, not verified" claims** (see Risks & Deployment Notes for the details):
  - Every bot-removal path already emitted `server:member-removed` before this change — confirmed by
    reading `bot-authorization.service.ts`, `server-moderation.service.ts`, `bots.service.ts`, and
    `account-deletion.service.ts`.
  - There is no live event for a channel permission-override change, for a bot or a human — confirmed
    by reading `ChannelsService.updatePermissionOverrides`, which emits nothing.
  - The multi-instance-safe sweep mechanism is `setInterval` plus a conditional-claim `UPDATE`
    (`ScheduledMessageSweepService`'s pattern), not `@nestjs/schedule` or a Redis lock.
- **Open Questions 31–34 resolved as their "Assumption used" column already stated** — bots receive
  `presence:update`/`typing:*` in shared rooms, slash commands are per-server only, permission to use
  a command is channel-level (`ViewChannel`+`SendMessages`) only, and the gateway/interaction limits
  are shared constants in `packages/shared` (`BOT_GATEWAY_MAX_CONNECTIONS`, `INTERACTION_TIMEOUT_MS`,
  `SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER`, `SLASH_COMMAND_OPTIONS_MAX`) — no new env vars.
- **Web/composer integration is out of scope for this implementation pass** (API/shared/realtime
  only, per the task brief) — `SLASH_COMMANDS`, `parseSlashCommand`, `getSlashCommandSuggestions`,
  `executeSlashCommand`, and the `interaction:timeout` listener wiring described in Changes →
  Invocation flow and the Technical Approach files table are **not yet implemented**. They are the
  explicit follow-up work this doc's API surface was built to support; see the handoff note at the
  end of the implementing session for the exact file-by-file list.

## Risks & Rollback

- **Risk**: extending `SocketUser` to a discriminated union touches every existing call site that
  reads `getSocketUser(client).id` — a missed call site that assumes `kind: 'human'` implicitly
  (e.g. reads `.sessionId` without checking `kind`) fails at runtime, not compile time, unless every
  such read is updated to destructure through the union properly (TypeScript narrows on `kind`, but
  only where the discriminant is actually checked). Mitigation: grep every `getSocketUser(` and
  `readSocketUser(` call site during implementation and add the receive-only guard as the very first
  line of every gateway handler, not per-handler ad hoc.
- **Risk, confirmed during implementation** (was "inferred, not verified"): the bot's per-socket room
  set is computed once at connect; if a channel's permission overrides change while the bot is
  connected, its room membership does not update live. **There is no such event at all today** —
  `ChannelsService.updatePermissionOverrides` (`channels/channels.service.ts:125-157`) writes the
  override rows and an audit log entry and returns; it injects no `RealtimePublisher` and emits
  nothing. This is not bot-specific: a _human_ client's room membership for that channel does not
  update live on an override change either (only `channel:join` adds a room, and nothing ever removes
  one on a permission change) — a bot's exposure here is the same pre-existing gap the whole app
  already has, not a new one this feature introduces. Until a live override-change event is added
  (tracked as a follow-up, not in this doc's scope), a bot (or a human) can keep receiving events for
  a channel a live permission change just hid from it, for the remainder of its connection.
- **Risk**: `interaction:create` targeted-emit-to-one-socket depends on `botRoom(botId)` staying
  accurate across instance crashes. **Mitigated structurally, not by a TTL** (unlike the
  `bot-sockets:<botId>` Redis registry this doc originally sketched, see Deviations): Socket.IO's own
  room membership already clears itself when a socket's underlying connection drops, including a
  crashed instance's sockets, once the transport/heartbeat times out — there is no separate registry
  entry that can go stale. A crash mid-connection still causes the same harmless emit-to-an-empty-room
  as a clean disconnect, and the
  interaction still times out correctly.
- **Not covered**: SFU/voice gateway interactions with a bot socket (a bot never voice-connects, so
  `voice.gateway.ts` needs no bot-specific logic beyond refusing bot sockets on any `voice:*` event,
  covered by the receive-only guard).
- **Not covered**: multi-instance interaction delivery ordering — if a bot holds sockets on two
  instances briefly during the connection-cap disconnect race, one `interaction:create` emit could
  in theory race the disconnect. Treated as an accepted edge case: worst case the bot receives (and
  can safely ignore, since `Interaction.token` is unique and re-answering it is a `409`) the event
  twice or the emit lands on the socket about to close and is lost — either way the invoker sees
  the same "no response" timeout, no incorrect state persists.
- **Rollback**: both migrations are additive-only (new tables/enum, no existing column touched);
  reverting the code is enough, and the `down` migration drops the new tables with no data-loss
  concern for other features since nothing else references them.

## Test Plan

Not covered by automated tests per `RULE.md:77`. Manual scenarios using a small Node script with
`socket.io-client` (kept outside this repo's `apps/`, not committed as a test file per this repo's
no-test-file convention) plus `curl` for REST steps:

1. **Happy path — gateway.** Create a bot, authorize it into a server with `VIEW_CHANNEL` +
   `SEND_MESSAGES` on one channel (per `bot-api.md`'s existing setup). Connect a script with
   `io(SOCKET_URL, { extraHeaders: { Authorization: 'Bot <token>' } })`. Post a human message in
   that channel from the web client → the script's `message:created` listener fires with the
   message. Post in a channel the bot's role cannot view → nothing arrives.
2. **Room scoping.** Authorize the same bot into a second server; confirm messages from the first
   server never reach a listener scoped incorrectly (manual code review of the emitted room plus
   observing no cross-talk in the script's log).
3. **Receive-only enforcement.** From the script, `socket.emit('message:create', { channelId, content:
'x' })` → expect an error ack / disconnect, not a created message; confirm no message appears in
   the channel.
4. **Removal live.** While the script is connected, remove the bot from the server (`DELETE
/servers/:serverId/bots/:botId`) → the script should stop receiving events for that server without
   a manual reconnect (assert no further `message:created` for that channel; if it was the bot's only
   server, assert the socket disconnects).
5. **Token regeneration live.** While connected, call `POST /bots/:botId/regenerate-token` → the
   script's socket disconnects; reconnecting with the old token fails; reconnecting with the new one
   succeeds.
6. **Slash command happy path.** Register `/greet` for the bot in a server via `POST
/bot-api/servers/:serverId/commands`. From the web client, type `/greet` in the composer of a
   channel the bot can see → it appears in suggestions alongside `me`/`nick`/`poll`/`invite`. Invoke
   it. The script receives `interaction:create`, calls `POST
/bot-api/interactions/:token/callback` with `{ content: 'hello!' }` → the message appears in the
   channel, and the composer's waiting state clears.
7. **Bot offline.** Do not run the script (or disconnect it) and invoke `/greet` → after
   `INTERACTION_TIMEOUT_MS`, the invoker sees the "The application did not respond" notice; no
   message is posted.
8. **Bot removed mid-flight.** Invoke `/greet`, then immediately remove the bot from the server
   before the script calls the callback → the callback call returns `403`; the interaction times out
   normally from the invoker's point of view.
9. **Token regenerated mid-flight.** Invoke `/greet`, regenerate the bot's token before the script
   answers → the callback with the old token returns `401`; interaction times out.
10. **Unauthorized channel.** As a member without `SendMessages` in a channel that has the command
    registered at the server level, confirm the command does not appear in suggestions, and a direct
    `POST /channels/:channelId/interactions` call returns `403`.
11. **Option validation.** Register a command with a required option; invoke it without the option →
    `400` with the missing option's name.
12. **Idempotency.** Have the script call the callback endpoint twice with the same token (simulating
    a client retry) → the second call returns `409`, and only one message is posted.
13. **Name collisions.** Attempt to register `nick` for a bot → `409 Command name is reserved`.
    Register the same custom name for two different bots in the same server → the second returns
    `409 Command name already used in this server`.

**Run 2026-09-18**, against the local dev API/Postgres/Redis, with a throwaway
`socket.io-client` script (`scratchpad/qa/wave3/wave3.cjs`, not committed to the repo per this
repo's no-test-file convention) plus the existing `curl`/`qa-lib.cjs`-based REST helpers:

- Scenarios 1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13 above: **20/20 assertions passed** (scenario 2, "room
  scoping" across two servers, was covered indirectly by scenario 1's per-channel scoping check and
  not run as its own separate two-server case; scenario 9, "token regenerated mid-flight" between
  invoke and callback specifically, was not additionally run beyond scenario 5's regeneration-while-
  connected case and the callback-with-old-token 401 already covered by phase 1's `bots.cjs`).
- Phase-1 bot REST regression (`scratchpad/qa/community/bots.cjs`): 32/33 passed. The one failure
  ("export lists bot without token") is unrelated to this doc — the account-export endpoint became an
  async job (`202 { jobId }`) through concurrent, unrelated work in this repo during the same session,
  and the old script's synchronous assumption is now stale; not a regression from this change.
- Human socket behavior unchanged: `scratchpad/qa/messaging/spoof.cjs` (1/1 passed) and a fresh
  two-user message-send-and-live-delivery check both passed with no observable difference from before
  this change.

See the implementing session's handoff report for the full pass/fail table and exact commands.

## Deployment Notes

- New env vars: `BOT_GATEWAY_MAX_CONNECTIONS` (default 1), `INTERACTION_TIMEOUT_MS` (default 15000),
  `SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER` (default 25) — add to `.env.example` with these defaults
  if they are made configurable rather than hardcoded constants in `packages/shared`; recommendation
  is to keep them as shared constants (matching how `BOT_API_REQUESTS_PER_MINUTE` and
  `BOT_MESSAGES_PER_MINUTE` are plain exported constants today, not env-driven) unless ops needs
  per-environment tuning.
- Migration `20260918002000_add_slash_commands_and_interactions` runs before deploying the API code
  that references the new tables; purely additive, no backfill, safe to run while the previous
  version of the API is still serving traffic.
- The scheduled interaction-timeout sweep (`interaction-timeout.service.ts`) uses the confirmed
  repo pattern (was "inferred, not verified"): **`setInterval` plus a conditional-claim `UPDATE`**,
  the same shape as `ScheduledMessageSweepService`
  (`scheduled-messages/scheduled-message-sweep.service.ts`) and `PresenceService.sweepStaleUsers` —
  not `@nestjs/schedule`, which this repo does not use anywhere, and not a Redis lock. Every instance
  runs the same `setInterval` (started `onApplicationBootstrap`, unref'd, an `isSweeping` flag
  preventing overlap on that instance); the only thing that decides a timeout across instances is
  `UPDATE "Interaction" SET status = 'TIMED_OUT' WHERE id = $1 AND status = 'PENDING'` — a losing
  instance's `updateMany` affects zero rows and moves on.
- Breaking API change: none — every new endpoint is additive; existing `/bot-api/*` and socket
  behavior for humans is unchanged except the `SocketUser` type becoming a discriminated union
  (internal to the API, not a wire-format change for existing human clients).
- `overview.md` for this menu does not exist yet (this repo's `docs/features/` is flat per its own
  convention, see `docs/README.md`'s Feature Specs table) — `bot-api.md`'s Scope section is updated
  in the same change with a one-line cross-reference to this doc; no other doc needs updating until
  this doc is implemented and its conclusions are worth folding back into `bot-api.md`'s "Deviations
  From The Original Design" the way phase 1 already did.
