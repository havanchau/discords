# Feature Spec: Bot API

Bot accounts owned by a user, authorized into a server with a chosen role, and able to read/write through the same REST and Socket.IO surface a human client uses, plus server-registered slash commands.

**Depends on**: [`incoming-webhooks.md`](./incoming-webhooks.md) — bot-posted messages reuse the same "synthetic `User` row as message author" design decided there (`User.isWebhook`/bot flag, `Message` author resolution), instead of inventing a second mechanism for machine-authored messages.

## Goal

A user creates a bot, gets a long-lived bot token, and an admin authorizes that bot into their server with a role that grants it specific permissions; the bot then reads and sends messages like a member, scoped to what its role allows.

Acceptance criteria (phase 1, see Scope):

- A user creates a bot under their account and receives the bot token exactly once at creation.
- `POST /bots/:botId/authorize` (called from a per-bot authorize URL an admin opens) adds the bot as a member of the chosen server with the chosen role, requires `MANAGE_ROLES` on the authorizing user, and is audited.
- The bot token authenticates REST calls the same way a session token does, scoped only to servers the bot has been authorized into.
- A bot can send a message to a channel it can see, following the exact same permission checks (`SendMessages`, timeout, slowmode) as a human member with its role.
- Removing a bot from a server (or deleting the bot) revokes its access immediately.
- Bot messages are visibly distinguished from human messages in the UI (reusing the badge from `incoming-webhooks.md`).

## Scope

- **In scope (phase 1)**: bot account creation and token issuance, authorize-into-server flow with role selection, bot token auth guard for REST, bot sending/reading messages via REST, bot visible in member list with its role, audit log entries, revoke/remove.
- **Explicitly out of scope for phase 1, tracked as future phases**:
  - **Phase 2 — Gateway access**: a bot connecting over Socket.IO to receive realtime events (`message:created`, etc.) the way a human client does. Phase 1 is REST-only (poll or webhook-driven), because the existing `getSocketUser`/session-cookie-based socket auth (`apps/api/src/modules/realtime/socket-user.ts`, not yet read in full for this doc) is built around session tokens, not bot tokens, and needs its own design pass rather than being folded into this one.
  - **Phase 3 — Slash commands**: server-registered commands that extend `SLASH_COMMANDS` (`apps/web/src/utils/slashCommands.ts:10-24`) with server- and bot-scoped entries, appearing in the composer's suggestion list (`getSlashCommandSuggestions`, `slashCommands.ts:49-56`) alongside the existing four hardcoded ones. Needs a registration endpoint, a per-server command registry, and a dispatch path from the composer to the owning bot — deliberately deferred so phase 1 ships a working bot identity and permission model first.
  - Phase 2 and phase 3 are designed together in [`bot-gateway-and-slash-commands.md`](./bot-gateway-and-slash-commands.md): the bot gateway (Socket.IO auth, room scoping, event allowlist) and slash commands are delivered over that same gateway connection, not an outbound HTTP callback.
  - **Phase 4+**: bot OAuth2 scopes narrower than "whatever role it's given," public bot listing/verification, rich interactions (buttons, modals), rate limit tiers per bot.

## Current Behavior

- No bot concept exists anywhere in the schema or `permissions.ts`. `ServerMember.kind` is a `MemberKind` enum with only `OWNER` and `MEMBER` (`apps/api/prisma/schema.prisma:23-26,224`).
- `JwtAuthGuard` only accepts a `Bearer` token whose payload has `sub`/`sid` and resolves to a live `Session` row (`apps/api/src/modules/auth/jwt-auth.guard.ts:19-58`) — there is no non-session bearer-token authentication path in the API today.
- `RolesService.createRole`/role assignment require `MANAGE_ROLES` (`apps/api/src/modules/roles/roles.service.ts:26`); `MemberRole` is the join table between a `ServerMember` and a `Role` (`apps/api/prisma/schema.prisma:253-260`, referenced by `roles` on `ServerMember:231`).
- The OAuth login flow (`apps/api/src/modules/auth/oauth/oauth.controller.ts:27-40`, `oauth.service.ts`) already implements a "redirect out, come back with a state cookie, exchange a code" pattern — the closest existing precedent in this repo for an authorize-style redirect flow, though it authenticates a human signing in, not a third party requesting server access.
- Slash commands are entirely client-side today: `SLASH_COMMANDS` is a hardcoded array of 4 entries with `owner: 'client' | 'server'` (`apps/web/src/utils/slashCommands.ts:10-24`), parsed by `parseSlashCommand` (`:35-46`) and suggested by `getSlashCommandSuggestions` (`:49-56`). Nothing in the API registers or dispatches a slash command; `owner: 'server'` entries (`nick`, `invite`) are presumably handled by sending the parsed command to an existing endpoint from the composer, not by a generic dispatch mechanism — the actual dispatch code (`executeSlashCommand.ts`, referenced but not read for this doc) was not inspected and should be read before phase 3 design.
- `Message.authorId` is required and non-nullable (`apps/api/prisma/schema.prisma:357,367`), same constraint `incoming-webhooks.md` designs around with a synthetic `User` row.

## Changes

### Rules

- **Bot creation**: any authenticated user can create a bot (`POST /bots`); `name` 2–32 characters, matching the emoji-name-adjacent pattern already used in this repo (`custom-emoji.md:11`'s `^[a-zA-Z0-9_]{2,32}$`, relaxed to allow spaces since this is a display name, not a token). A user may own up to 10 bots.
- **Token**: issued once at creation, shown once, never re-displayed; only a hash is stored, following the same `sha256` approach as `incoming-webhooks.md`'s webhook token (not `bcrypt`, for the same fast-lookup-by-hash reason). Regenerating a bot's token is a separate action that invalidates the old one immediately, mirroring the webhook doc's Regenerate action.
- **Authorize into a server**: the bot owner shares an authorize link (`/bots/:botId/authorize?serverId=`, opened while the admin is signed into the web client); the admin picks one existing role for the bot from that server's role list and confirms. This requires the confirming user to hold `MANAGE_ROLES` on that server (an admin choosing what a bot can do is equivalent in trust level to an admin creating a role). On confirm, a `ServerMember` row is created for the bot's `User` with `kind: BOT` and the chosen role attached via `MemberRole`, exactly like a human member gets a role assigned.
- A bot cannot be authorized into a server it is already a member of (`409 Bot already in this server`); re-authorizing to change its role is a separate "change bot role" action reusing the existing member-role-edit endpoint, not a new one.
- **Sending messages**: the bot token authenticates a request the same way a session token does; the resulting "current user" is the bot's synthetic `User`. `MessagesService.createMessage` runs unmodified — `requireChannelPermission(SendMessages)`, `requireNotTimedOut`, and slowmode all apply to the bot's role exactly like a human member's.
- **Reading**: `GET` endpoints (list messages, list channels, etc.) work unmodified once the bot token resolves to a member with `VIEW_CHANNEL` on the requested channel — no bot-specific read path.
- **Revoke**: removing the bot from a server deletes its `ServerMember` row (same as a kick); deleting the bot account entirely also revokes every server membership and invalidates the token. Both are audited.
- Audit: `BOT_CREATE` `{ name }`, `BOT_AUTHORIZE` `{ botId, botName, roleId }`, `BOT_REMOVE` `{ botId, botName }`, `BOT_TOKEN_REGENERATE` `{ botId }`.
- Rate limits on bot-authenticated REST calls use the same per-route `@RateLimit` decorators a human session hits; there is no separate bot tier in phase 1 (see Scope, phase 4).

### Client

- A new "Developer" or "Bots" section under user Settings (new, following the pattern of the existing settings sections referenced in `ServerSettings.tsx`): list of owned bots, create form (name, optional avatar), token shown once with a copy button and a "you will not see this again" warning (reusing the one-time-secret display pattern from `incoming-webhooks.md`), Regenerate token, Delete bot.
- Each bot's detail view shows its authorize URL (`{WEB_BASE_URL}/bots/:botId/authorize`) to copy and share.
- Opening an authorize URL while signed in and holding `MANAGE_ROLES` on the target server (passed via `?serverId=`) shows a confirmation dialog: bot name/avatar, a role picker (the server's existing roles, reusing the role list already fetched for `ServerSettings`), and a Confirm button — mirrors the invite-accept page's "you're about to join" pattern for shape, though invites and bot authorization are different flows.
- Server settings' member list marks bot members with the same badge `incoming-webhooks.md` introduces for webhook-authored messages, applied to the member row instead of just the message row.

## Technical Approach

### Data model

```prisma
model Bot {
  id           String    @id @default(cuid())
  ownerId      String
  botUserId    String    @unique
  name         String
  avatarUrl    String?
  tokenHash    String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  owner        User @relation("BotOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  botUser      User @relation("BotUser", fields: [botUserId], references: [id], onDelete: Cascade)

  @@index([ownerId])
  @@index([tokenHash])
}
```

`MemberKind` gains a `BOT` value: `enum MemberKind { OWNER MEMBER BOT }`. `User` reuses the `isWebhook`-style flag introduced in `incoming-webhooks.md`, generalized to `botOrWebhookKind: 'NONE' | 'WEBHOOK' | 'BOT'` if that doc has not shipped yet, or a second `isBot` boolean if it has — **this is an explicit dependency ordering question for whoever implements both**, noted in Open Questions rather than decided here, since the two docs were written together but may ship in either order.

Migration `20260917020000_add_bots` (after `incoming-webhooks.md`'s migration, since it extends the same `User` flag pattern).

### API

| Method   | Path                             | Auth      | Body                                          | Response                                                                  | Rate limit                      |
| -------- | -------------------------------- | --------- | --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `GET`    | `/bots`                          | session   | —                                             | `{ bots: Array<{ id, name, avatarUrl, createdAt }> }` (caller's own bots) | default                         |
| `POST`   | `/bots`                          | session   | `{ name, avatarUrl? }`                        | `201 { bot, token }` (`token` shown once)                                 | 10/min                          |
| `POST`   | `/bots/:botId/regenerate-token`  | session   | —                                             | `{ token }`                                                               | 10/min                          |
| `DELETE` | `/bots/:botId`                   | session   | —                                             | `{ ok: true }`                                                            | 10/min                          |
| `POST`   | `/bots/:botId/authorize`         | session   | `{ serverId, roleId }`                        | `201 { member }`                                                          | 10/min                          |
| `DELETE` | `/servers/:serverId/bots/:botId` | session   | —                                             | `{ ok: true }` (remove from server)                                       | 10/min                          |
| `POST`   | `/channels/:channelId/messages`  | bot token | same `CreateMessageDto` as the human endpoint | same response shape as `messages.controller.ts:65-71`                     | same `30/min` as human messages |

The bot-token endpoints reuse the **existing** message/channel/server REST routes rather than a parallel `/bot/...` namespace, gated by a new `BotAuthGuard` that accepts either a session bearer token (unchanged) or a bot bearer token, resolving to the bot's synthetic `User`. This keeps `MessagesService`, `PermissionsService`, and every other consumer of `request.user` unmodified.

### Realtime

Out of scope for phase 1 (see Scope, phase 2). Bot-sent messages still broadcast to other connected human clients through the existing `message:created` path, because `MessagesService.createMessage` is called through the same REST controller a human uses — this direction (bot writes are visible to humans) works in phase 1; only the reverse (bot receives realtime events) is deferred.

### Files

- API: `modules/bots/bots.module.ts`, `bots.controller.ts`, `bots.service.ts`, `dto/create-bot.dto.ts`, `dto/authorize-bot.dto.ts`, `modules/auth/bot-auth.guard.ts` (new, or `JwtAuthGuard` extended to also check a bot-token header/scheme), `prisma/schema.prisma`, `app.module.ts`.
- Web: `api.ts`, `hooks/useOwnedBots.ts`, `components/settings/BotsSection.tsx` (user settings), `components/bots/BotAuthorizePage.tsx` (new route), `App.tsx` (route registration), `components/settings/MemberModerationSection.tsx` / member list (bot badge, reusing `incoming-webhooks.md`'s badge component).

## Trade-offs

- **Reusing existing REST routes with a permissive auth guard vs. a parallel `/bot/*` API surface**: Discord's own public API is a fully separate bot-facing surface, but this repo has no versioned/public API contract to begin with (`docs/api.md` was not found as an existing file in `docs/features/`), and reusing routes means `MessagesService`, `PermissionsService`, and every DTO stay untouched — a bot is "just another authenticated member" from the service layer's point of view. Cost: any future human-only assumption baked into those routes (e.g., a field that reads `request.user.email`) silently breaks for a bot caller and must be audited case by case rather than being structurally impossible.
- **`MemberKind.BOT` vs. a separate `BotMember` table**: extending the existing enum keeps every `ServerMember`-joining query (permission checks, member list, mention resolution) working without a second table and a second join; the cost is that `MemberKind` now conflates "how did this row come to exist" (owner vs. invited) with "what kind of actor is this" (human vs. bot), which is a mild modeling smell but avoids duplicating every membership query.
- **Phase 1 REST-only vs. shipping gateway access immediately**: shipping socket auth for bots in the same change as the identity/permission model roughly doubles the auth-surface risk in one PR (two new authentication paths — REST bot tokens and socket bot tokens — reviewed together); splitting lets the REST+authorize+permission model be verified in production before extending the same trust boundary to the realtime layer, which `security-check.md:38-46` treats as its own risk category ("Authenticate every Socket.IO connection").
- **Slash command registration deferred to phase 3**: the existing `SLASH_COMMANDS` array (`slashCommands.ts:10-24`) is a small, fully client-known list; making it server-extensible needs a registry, a per-server merge with the built-in four, and a dispatch path to the correct bot — enough new surface that folding it into the bot-identity doc would make this doc's Acceptance Criteria unverifiable as one unit. It is called out explicitly rather than silently dropped, per the task's own instruction to define phase 1 and push the rest out.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- **Migration** is `20260917013000_add_bot_api`, not `20260917020000_add_bots`. It adds `BOT` to `MemberKind` and to `UserKind` (the `User.kind` enum from [incoming-webhooks.md](./incoming-webhooks.md), which settled the flag-shape question) and creates the `Bot` table (`apps/api/prisma/models/bots.prisma`). The new enum values are added but not used anywhere in the migration, because PostgreSQL refuses a value added in the same transaction. `Bot.tokenHash` has no index; see the token format below.
- **Token format** is `<botId>.<secret>`, where the secret is `randomBytes(32)` base64url. The id locates the row by primary key, and the SHA-256 of the secret is compared with `timingSafeEqual`, the same scheme webhooks use. The helpers moved to `apps/api/src/common/secret-token.ts` (`generateSecretToken`, `hashSecretToken`, `secretTokenMatches`, `syntheticUserIdentity`), and `webhooks/webhook-token.ts` now re-exports them.
- **Separate bot surface, not reused human routes.** The spec reused `POST /channels/:channelId/messages` behind a guard accepting both credentials. Instead:
  - Bots call an explicit allowlist under `/bot-api/*` (`bots/bot-api.controller.ts`) guarded only by `BotAuthGuard`, which accepts `Authorization: Bot <token>` and nothing else.
  - Every other controller keeps `JwtAuthGuard`, which accepts only `Bearer` session JWTs backed by a live `Session` row. A bot never has a session, because every sign-in path refuses non-`HUMAN` users.
  - Neither credential therefore works where the other is expected, and a human-only route cannot be reached by a bot by accident.
  - The guard sets `request.bot`, not `request.user`, so `CurrentUser` is never populated by a bot token.
- **Phase 1 allowlist** (all bot token):

  | Method | Path                                    | Behaviour                                                                                                                                      |
  | ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | `GET`  | `/bot-api/users/@me`                    | `{ botId, user: { id, username, displayName, avatarUrl, kind } }`                                                                              |
  | `GET`  | `/bot-api/servers`                      | `ServersService.listForUser` for the bot user: its servers, channels filtered by `VIEW_CHANNEL`                                                |
  | `GET`  | `/bot-api/channels/:channelId/messages` | `MessagesService.listMessages` (`?cursor=`); `VIEW_CHANNEL` required                                                                           |
  | `POST` | `/bot-api/channels/:channelId/messages` | `MessagesService.createMessage`: `SEND_MESSAGES`, timeout, slowmode, AutoMod; then `message:created` and `unread:updated`; mention push inside |

  The send body is `{ content, replyToMessageId? }` (`BotCreateMessageDto`). Attachments are refused as unknown fields, because the upload route is not on the allowlist.

- **Send rules**: identical to a member's, keyed on the bot's user id, with one exception. Rules screening does not apply to a bot (`memberNeedsOnboarding` returns false for `kind: BOT`): a bot cannot read or accept rules, and the admin who authorized it chose its role. AutoMod's timeout action times a bot out like any member.
- **Rate limits** (the spec had none per bot):
  - The global per-IP middleware still applies.
  - Every `/bot-api/*` call counts against `BOT_API_REQUESTS_PER_MINUTE` (120) per bot in Redis, after the token is verified.
  - Sends are also limited per bot to `BOT_MESSAGES_PER_MINUTE` (30), plus a per-IP route limit of 120/min, so several bots behind one host do not share a 30/min bucket.
  - A `429` sets `Retry-After`.
- **Session API as built**:

  | Method   | Path                             | Response                                                                                        | Rate limit |
  | -------- | -------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
  | `GET`    | `/bots`                          | `{ bots: OwnedBot[] }` (`id, name, avatarUrl, createdAt, serverCount`)                          | default    |
  | `POST`   | `/bots`                          | `201 { bot, token }`                                                                            | 10/min     |
  | `POST`   | `/bots/:botId/regenerate-token`  | `{ token }`                                                                                     | 10/min     |
  | `DELETE` | `/bots/:botId`                   | `{ ok: true }`                                                                                  | 10/min     |
  | `GET`    | `/bots/:botId/authorize`         | `{ bot, servers: [{ id, name, alreadyMember, banned, grantableRoles }] }` (new, for the dialog) | default    |
  | `POST`   | `/bots/:botId/authorize`         | `201 { member }`                                                                                | 10/min     |
  | `DELETE` | `/servers/:serverId/bots/:botId` | `{ ok: true }`; requires `MANAGE_ROLES`                                                         | 10/min     |

- **Name** is 2–32 characters of letters, digits, spaces, `_` and `-` (`BOT_NAME_PATTERN`), trimmed. At most 10 bots per owner (`400 Bot limit reached`).
- **Authorize checks, in order**:
  1. The bot exists and its owner has not requested account deletion (`404 Bot not found`).
  2. The server exists and is not deleted (`404`).
  3. The caller holds `MANAGE_ROLES` there (`403`).
  4. The bot is not banned (`403 This bot is banned from this server`) and not already a member (`409 Bot already in this server`, also on a concurrent double confirm through the unique key).
  5. The role belongs to the server (`404 Role not found`).
- **No privilege escalation** (not in the spec). The bot receives the chosen role plus `@everyone`, and `installerCanGrant` (`bots/bot-grant.ts`) refuses with `403 Cannot grant a bot permissions you do not have` unless:
  - every server-level permission of those roles is held by the installer;
  - every channel override that allows something to those roles allows only what the installer already has in that channel.

  The owner may grant anything. The dialog lists only roles that pass the same function. Changing a bot's role later goes through the existing member-role endpoint, which, as for people, has no such check (see Risks).

- **Audit**:
  - `BOT_AUTHORIZE { botId, botName, roleId }`.
  - `BOT_REMOVE { botId, botName }`, written by remove-from-server, by bot deletion (one row per server it left), and by owner account anonymization.
  - `BOT_TOKEN_REGENERATE { botId }`, written once per server the bot is in, because audit rows belong to a server.
  - `BOT_CREATE` is **not** audited: a new bot belongs to no server, and `AuditLog.serverId` is required. Creation is logged with ids only.
  - Kicking or banning a bot through the moderation routes writes the existing `MEMBER_KICK` / `MEMBER_BAN`.
- **Delete** removes the memberships and the `Bot` row in one transaction and emits `server:member-removed` to each server room. The bot's `User` row stays, so past messages keep their author, as with webhooks.
- **Kind-filter audit** (every `kind`/`'HUMAN'` comparison was re-read):
  - **Stays excluded for `BOT`**, because each check compares against `HUMAN`: password login and the session gate (`auth.service.ts`), password reset, verification resend, OAuth linking, friend requests by name, email or id, block by id, and the deletion sweep's due-account query.
  - **Changed**:
    - Ban by id now accepts `HUMAN` and `BOT` (`server-moderation.service.ts`).
    - Discovery's listing floor, its shown member count and search count only non-bot members (`server-discovery.service.ts`), so bots cannot pad a server into the directory.
    - The onboarding gate exempts bots.
  - **Bots take part as members**: member lists (with a "Bot" badge in `MemberSidebar`, whose "Message" action is hidden for bots), kick, ban, timeout, role editing, permission evaluation, and unread recipients. Unread and mention events for a bot are emitted to a room nobody joins, because bots have no socket in phase 1.
  - Bots are not `@`-mentionable by username, since `bot-<hex>` contains `-`, which the mention pattern stops at.
- **Owner account deletion**:
  - While deletion is pending, `BotAuthGuard` refuses the owner's bots and they cannot be authorized anywhere. Cancelling restores both.
  - Anonymization deletes every owned bot through the same `deleteBotWithMemberships` and emits `server:member-removed`.
  - The account export lists bots (`id, name, avatarUrl, createdAt, username, servers`), never a token or hash.
- **Web**:
  - The "Bots" section sits in the profile dialog beside the other account sections (`components/settings/BotsSection.tsx`, `hooks/useOwnedBots.ts`). A row copies the authorize link (`{web origin}/bots/:botId/authorize`); the token shows once after create or regenerate.
  - Opening that link while signed in shows `components/bots/BotAuthorizeDialog.tsx` (mounted in `AuthenticatedWorkspace`, not `AppShell`). It offers a server picker (only servers where the viewer holds `MANAGE_ROLES`, honouring `?serverId=`), a role picker (grantable roles only), and a notice when the bot is already in or banned from the server.
  - `MessageRow` shows a "Bot" badge for `author.kind === 'BOT'`, and the profile card still opens because a bot is a member.
  - Copy: `i18n/locales/{en,vi}/bots.ts`.
- **New translated API errors**: `Bot already in this server`, `Bot limit reached`, `Bot name is too short`, `Bot not found`, `Cannot grant a bot permissions you do not have`, `Invalid bot token`, `Missing bot token`, `This bot is banned from this server`.
- **Grant rule shared (2026-09-17):** `installerCanGrant` moved to `apps/api/src/modules/permissions/role-grant.ts` as `canGrantRoles`, and role create, edit, delete, add and remove now enforce it too. Mention push and AutoMod alerts name a bot by its display name. See [wave-3-2-follow-ups.md](./wave-3-2-follow-ups.md).

## Risks & Rollback

- **Risk**: a bot token has no session/refresh-token expiry model (unlike human `Session` rows at `schema.prisma:156-169`, which the OAuth/auth flow already revokes on logout) — a leaked bot token is valid until manually regenerated. Same class of risk `incoming-webhooks.md` already accepts for webhook URLs; mitigated by Regenerate + Delete, not by an expiry.
- **Risk**: `MemberKind.BOT` rows must be excluded everywhere a human-only assumption exists (presence heartbeat, "who's typing," friend requests) — every such call site needs auditing during implementation, the same class of risk flagged in `incoming-webhooks.md` for `User.isWebhook`.
- **Risk**: reusing human REST routes for bot auth means a bug in `BotAuthGuard` (e.g., accepting a malformed token as valid) exposes the entire message/channel/server surface, not a narrow bot-only endpoint — this guard needs the same scrutiny as `JwtAuthGuard` itself.
- **Risk (pre-existing, not changed here)**: `POST /servers/:serverId/members/:memberId/roles/:roleId` (`RolesService.addMemberRole`) lets any `MANAGE_ROLES` holder assign any role, including to a bot, without the escalation check authorize applies. It is the same for people today; fixing it changes role management for everyone and is left as a follow-up.
- **Risk**: a bot's push and AutoMod alert texts name it by its `bot-<hex>` username, not its display name, because `createMessage` passes `author.username`.
- **Risk**: signing in through OAuth from an authorize link returns to `/`, so the admin has to open the link again after signing in.
- **Rollback**: revert code; the migration is additive (new table, new enum value, no destructive column change), so rollback needs no backfill.

## Test Plan

Not covered by automated tests per `RULE.md:77`. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:file-size`, `npm run i18n:check`, `npm run ui:scan`, `npm run docs:check`. None of the manual scenarios below has been run yet.

- **Manual**: in Settings → Profile → Bots, create a bot and copy its token. Open its authorize link as a server admin, pick a role that only has `VIEW_CHANNEL` + `SEND_MESSAGES`, and confirm. Then run `curl -X POST <api>/bot-api/channels/:id/messages -H "Authorization: Bot <token>" -H 'Content-Type: application/json' -d '{"content":"hi from bot"}'`. The message appears live in an open human client with the "Bot" badge, the member list shows the bot with the badge and its role, and the audit log shows `BOT_AUTHORIZE`.
- **Manual**: `GET /bot-api/servers` lists that server with only the channels the role can view. `GET /bot-api/channels/:id/messages` works on a viewable channel and returns `403` on a private one.
- **Manual**: give the bot's role no `SEND_MESSAGES` → the send returns the same `403 Missing permission: SEND_MESSAGES` a member gets. Time the bot out → `403` timed out. Turn on slowmode → `429`. Turn on rules screening → the bot still sends.
- **Manual**: kick the bot, or `DELETE /servers/:serverId/bots/:botId` → the next send returns `403` and the member list drops it live. Ban the bot → authorize now shows "banned" and `POST /bots/:botId/authorize` returns `403`.
- **Manual**: regenerate the token → the old token returns `401 Invalid bot token` and the new one works; each server the bot is in shows `BOT_TOKEN_REGENERATE`. Delete the bot → the token returns `401`, and past messages keep the bot's name.
- **Failure case**: send a session access token as `Authorization: Bot <jwt>`, or the bot token as `Authorization: Bearer <token>` to `/bot-api/*` or to `POST /channels/:id/messages` → `401` every time.
- **Failure case**: a member with `MANAGE_ROLES` but without `BAN_MEMBERS` tries to authorize with a role holding `BAN_MEMBERS` → `403 Cannot grant a bot permissions you do not have`, and the dialog does not list that role. A user without `MANAGE_ROLES` → `403`, and no member row is created.
- **Failure case**: 31 sends in a minute from one bot → the 31st returns `429` with `Retry-After`.
- **Manual**: the bot's owner requests account deletion → the bot's token returns `401` during the grace period and works again after cancelling. After anonymization the bot is gone from every server (`BOT_REMOVE`), and the export taken before lists the bot without a token.

## Deployment Notes

- Run migration `20260917013000_add_bot_api` after `20260917012000_add_incoming_webhooks` and before deploying the API. It adds enum values and a table; no backfill, and no table rewrite.
- No new env var for phase 1.
- `BotAuthGuard` is attached only to `BotApiController` (`/bot-api/*`); no existing route changed its guard. Review it with the same care as `JwtAuthGuard`, because it is a new authentication path.
- A proxy in front of the API must forward the `Authorization` header on `/bot-api/*` and must not log it. The web host must serve `index.html` for `/bots/:botId/authorize` (the bundled nginx `try_files` already does).
