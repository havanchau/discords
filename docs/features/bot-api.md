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

## Risks & Rollback

- **Risk**: a bot token has no session/refresh-token expiry model (unlike human `Session` rows at `schema.prisma:156-169`, which the OAuth/auth flow already revokes on logout) — a leaked bot token is valid until manually regenerated. Same class of risk `incoming-webhooks.md` already accepts for webhook URLs; mitigated by Regenerate + Delete, not by an expiry.
- **Risk**: `MemberKind.BOT` rows must be excluded everywhere a human-only assumption exists (presence heartbeat, "who's typing," friend requests) — every such call site needs auditing during implementation, the same class of risk flagged in `incoming-webhooks.md` for `User.isWebhook`.
- **Risk**: reusing human REST routes for bot auth means a bug in `BotAuthGuard` (e.g., accepting a malformed token as valid) exposes the entire message/channel/server surface, not a narrow bot-only endpoint — this guard needs the same scrutiny as `JwtAuthGuard` itself.
- **Rollback**: revert code; the migration is additive (new table, new enum value, no destructive column change), so rollback needs no backfill.

## Test Plan

Not covered by automated tests per `RULE.md:77`. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`.

- **Manual**: create a bot, copy its token → authorize it into a test server with a role that only has `VIEW_CHANNEL` + `SEND_MESSAGES` → `curl -X POST .../channels/:id/messages -H "Authorization: Bearer <bot token>" -d '{"content":"hi from bot"}'` → message appears live to a human client open in that channel, author shows the bot badge.
- **Manual**: authorize the same bot into a server with a role that lacks `SEND_MESSAGES` → the same `curl` call returns the existing permission-denied response `MessagesService` already returns for a human without that permission.
- **Manual**: remove the bot from the server → the same `curl` call now fails (bot is no longer a member); re-run against a different server it was never authorized into → same failure.
- **Failure case**: authorize attempt by a user without `MANAGE_ROLES` on the target server → `403`, no `ServerMember` row created.

## Deployment Notes

- Run migration `20260917020000_add_bots` before deploying the API; it depends on `incoming-webhooks.md`'s migration landing first if that doc's `User` flag is reused instead of duplicated (see Open Questions on ordering).
- No new env var for phase 1.
- Deploying `BotAuthGuard` changes the auth surface of every REST route it is attached to — flagged per `rules/security.md`'s "every endpoint has a guard by default" as a change that should be reviewed with the same care as `JwtAuthGuard` itself, not treated as an additive/low-risk change.
