# Feature Spec: Incoming Webhooks

A per-channel URL, containing a secret token, that lets an external service post a message into that channel without a user session.

## Goal

Members with the right permission create a webhook for a text channel; posting a `POST` request with a JSON body to the webhook's URL creates a message in that channel, with optional name/avatar override.

Acceptance criteria:

- `POST /servers/:serverId/channels/:channelId/webhooks` creates a webhook and returns its URL (including the plaintext token) exactly once.
- `POST /webhooks/:webhookId/:token` (no auth header, no session) creates a message in the webhook's channel using `content` and optional `username`/`avatarUrl` overrides, and returns `201`.
- The stored token is never returned again after creation; only a hash is persisted.
- Regenerating a webhook's token invalidates the old URL immediately.
- Deleting (revoking) a webhook stops the URL from working immediately and is audited.
- Every member of the channel sees the webhook message appear live, the same as any other message.
- Posting is rate-limited independently of the per-user message rate limit, since the caller has no user identity.

## Scope

- **In scope**: `ServerWebhook` model, create/list/delete/regenerate endpoints, the public posting endpoint, a synthetic "webhook author" representation for `Message.authorId`, realtime broadcast reuse, audit log entries, a "Webhooks" section in channel/server settings.
- **Out of scope**: outgoing webhooks (this repo pushing events to a URL on trigger), embeds/rich content beyond plain text and an attachments array, editing or deleting a message after a webhook posts it, per-webhook rate limit configuration, webhook execution via Slack-compatible payload shape.

## Current Behavior

- `Message.authorId` is a required, non-nullable `String` foreign key to `User` (`apps/api/prisma/schema.prisma:357`, `:367`); every message-creation path requires an authenticated `userId` (`apps/api/src/modules/messages/messages.service.ts:163`).
- `createMessage` runs `requireReadableChannel`, `requireChannelPermission(SendMessages)`, `requireNotTimedOut`, and slowmode before creating the row (`apps/api/src/modules/messages/messages.service.ts:163-167`), all keyed on a real member's `userId`.
- `MessagesService.createMessage` itself never calls `this.realtime.emitToRoom` (grepped: the only `emitToRoom` calls in that file are for thread-create, update, and pin/unpin at lines 345, 397, 432). The REST route `POST /channels/:channelId/messages` (`apps/api/src/modules/messages/messages.controller.ts:65-71`) calls `createMessage` and returns the result **without broadcasting**. The realtime broadcast for an ordinary new message only happens in the Socket.IO path: `MessagesGateway.createMessage` (`apps/api/src/modules/realtime/messages.gateway.ts:44-74`) calls `messages.createMessage`, then explicitly does `this.publisher.emitToRoom(this.publisher.channelRoom(body.channelId), 'message:created', result.message)` (lines 68-72) and `this.emitUnreadUpdated(result.message)` (line 73). A webhook post has no socket connection, so it must call the service and then perform this same explicit broadcast + unread update itself — it cannot rely on `createMessage` doing it.
- `packages/shared/src/permissions.ts:1-17` has no `MANAGE_WEBHOOKS` permission; the closest existing bit is `ManageChannels` (`'MANAGE_CHANNELS'`).
- `JwtAuthGuard` (`apps/api/src/modules/auth/jwt-auth.guard.ts:12-58`) requires a `Bearer` session token on every guarded controller; there is no existing "no-auth, token-in-URL" controller pattern in this repo to copy directly — the closest precedent is the password-reset flow, which hashes a `randomBytes(32)` token with `createHash('sha256')` and compares hashes (`apps/api/src/modules/auth/password-reset.service.ts:2-12,35`), rather than `bcrypt`, because it must do a fast lookup by hash instead of a per-row compare.
- `apps/api/src/common/rate-limit.guard.ts:17-46` keys rate limits by client IP plus route, not by user, so it already works for an unauthenticated endpoint.
- `apps/api/src/common/rate-limit.decorator.ts:1-13` (`@RateLimit({ limit, windowMs, keyPrefix? })`) is the existing per-route limit mechanism, applied the same way `server-events.md`'s endpoints use `20/min` (`docs/features/server-events.md:91-94`).

## Changes

### Rules

- Create: caller needs `MANAGE_CHANNELS` on the target channel (reusing the existing permission bit rather than adding `MANAGE_WEBHOOKS` — see Trade-offs) and the channel must be a text channel in the caller's server (`404 Channel not found` otherwise).
- A channel holds at most 10 webhooks (`400 Webhook limit reached`), matching the order of magnitude of the emoji-per-server cap in `custom-emoji.md:11`.
- `name` for the webhook itself (shown in settings, not required on every post) is 1–80 characters after trimming.
- The token is generated with `randomBytes(32).toString('base64url')`, following `password-reset.service.ts:35`'s existing token style; only `createHash('sha256').update(token).digest('hex')` is stored, following `password-reset.service.ts:12`'s hashing style exactly (not `bcrypt`, because the posting endpoint must look the row up by token in one indexed query rather than iterate and `bcrypt.compare` every webhook).
- The full URL (`{API_BASE_URL}/webhooks/:webhookId/:token`) is returned only in the create and regenerate responses; `GET`/list responses never include the token, only `id`, `name`, `channelId`, `avatarUrl`, `createdAt`.
- Posting: `content` 1–2000 characters after trimming (empty rejected — this endpoint has no attachment path in phase 1, so the "empty allowed with attachments" rule from `RULE.md:38` does not apply here); `username` override 1–80 characters, optional, defaults to the webhook's stored `name`; `avatarUrl` override optional, must match the same uploaded-image URL pattern `custom-emoji.md:34` already requires for emoji, defaults to the webhook's stored `avatarUrl`.
- An unknown `webhookId`, a token that does not hash-match, or a revoked webhook all return the same `404 Not found` (never a `401`/`403` — there is no caller identity to distinguish, and a distinct status would let a caller fingerprint which case failed).
- Regenerate: same permission as create; returns a new plaintext URL; the previous token stops matching immediately (single-token-per-webhook, not multiple valid tokens).
- Delete (revoke): same permission; `404` if the webhook does not belong to the given channel/server.
- Audit: `WEBHOOK_CREATE` `{ name, channelId }`, `WEBHOOK_REGENERATE` `{ webhookId }`, `WEBHOOK_DELETE` `{ webhookId, name }`, written the same way `writeAuditLog` is called elsewhere (`apps/api/src/modules/messages/messages.service.ts:427`, `apps/api/src/modules/servers/server-moderation.service.ts:42`).
- Realtime: after `MessagesService.createMessage` returns, the webhook posting handler calls `this.publisher.emitToRoom(this.publisher.channelRoom(channelId), 'message:created', result.message)` and the same unread-count update the socket gateway performs (`messages.gateway.ts:68-73`), so the message appears live exactly like a socket-created one — no new event type, so clients need no new handling.

### Message authorship

- `Message.authorId` cannot be null (`apps/api/prisma/schema.prisma:357,367`), so a webhook post needs a real `User` row to satisfy the foreign key. Each `ServerWebhook` owns exactly one synthetic `User` row, created alongside the webhook, with no `passwordHash` usable for login (a random, never-communicated `bcrypt` hash, the same shape `passwordHash` already requires as `String` non-null at `schema.prisma:39`) and a new `User.isWebhook` flag so the web client and any future login/auth path can exclude it.
- The per-post `username`/`avatarUrl` override does not rewrite the synthetic `User` row (that would let one post silently retitle every past message from that webhook); instead `MessageAuthorOverride` fields are stored per message: `authorNameOverride`, `authorAvatarOverride`, nullable, read by the client in place of the joined `User.displayName`/`avatarUrl` when present.
- `formatMessage` (`apps/api/src/modules/messages/messages.service.ts`, called at lines 189, 391, 426) needs the override fields added to its output shape so `MessageRow` can render them without a second webhook lookup.

### Client

- Server settings gains a "Webhooks" section per channel (new tab or a channel picker + list, following `ServerEmojiSection`'s section pattern referenced in `ServerSettings.tsx:171` and `custom-emoji.md:79`): create form (name, optional avatar upload reusing the existing upload flow), list of webhooks with copy-URL, Regenerate, and Delete, rendered only for members holding `MANAGE_CHANNELS` on that channel (UI gating; the API enforces).
- The created/regenerated URL is shown once in a dismissible confirmation with a copy button and a warning that it will not be shown again, mirroring how a one-time secret would be handled elsewhere in the repo (no existing precedent found; this is a new UI pattern for this repo).
- Messages posted by a webhook render through the existing `MessageRow` with a small "BOT"-style badge next to the display name (new, since `User.isWebhook` is new) so members can tell it apart from a real member; no other rendering path changes because it still flows through `message:created`.

## Technical Approach

### Data model

```prisma
model ServerWebhook {
  id         String    @id @default(cuid())
  serverId   String
  channelId  String
  creatorId  String
  webhookUserId String @unique
  name       String
  avatarUrl  String?
  tokenHash  String
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  server      Server  @relation(fields: [serverId], references: [id], onDelete: Cascade)
  channel     Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  creator     User    @relation("WebhookCreator", fields: [creatorId], references: [id])
  webhookUser User    @relation("WebhookUser", fields: [webhookUserId], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@index([tokenHash])
}
```

`User` gains `isWebhook Boolean @default(false)`. `Message` gains `authorNameOverride String?` and `authorAvatarOverride String?`, both nullable and additive.

Migration `20260917010000_add_incoming_webhooks`.

### API

| Method   | Path                                                             | Auth          | Body                                 | Response                                                                | Rate limit       |
| -------- | ---------------------------------------------------------------- | ------------- | ------------------------------------ | ----------------------------------------------------------------------- | ---------------- |
| `GET`    | `/servers/:serverId/channels/:channelId/webhooks`                | session       | —                                    | `{ webhooks: Array<{ id, name, avatarUrl, createdAt }> }`               | default          |
| `POST`   | `/servers/:serverId/channels/:channelId/webhooks`                | session       | `{ name, avatarUrl? }`               | `201 { webhook, url }` (`url` includes the plaintext token, shown once) | 10/min           |
| `POST`   | `/servers/:serverId/channels/:channelId/webhooks/:id/regenerate` | session       | —                                    | `{ url }`                                                               | 10/min           |
| `DELETE` | `/servers/:serverId/channels/:channelId/webhooks/:id`            | session       | —                                    | `{ ok: true }`                                                          | 10/min           |
| `POST`   | `/webhooks/:webhookId/:token`                                    | none (public) | `{ content, username?, avatarUrl? }` | `201 { messageId }`                                                     | 30/min per token |

The public endpoint sits in its own `webhooks.controller.ts` with no `@UseGuards(JwtAuthGuard)`, and uses `@RateLimit` with a `keyPrefix` that includes `:webhookId` (not IP alone) so one flooding integration cannot exhaust the shared per-IP bucket used by everything else, and one shared proxy IP hosting several integrations cannot rate-limit-lock each other out.

### Files

- API: `modules/webhooks/webhooks.module.ts`, `webhooks.controller.ts` (server-scoped CRUD), `webhook-post.controller.ts` (public posting endpoint, no guard), `webhooks.service.ts`, `dto/create-webhook.dto.ts`, `dto/post-webhook-message.dto.ts`, `app.module.ts`, `messages/messages.service.ts` (`formatMessage` override fields), `prisma/schema.prisma`.
- Web: `api.ts`, `hooks/useChannelWebhooks.ts`, `components/settings/ChannelWebhooksSection.tsx`, `ServerSettings.tsx`, `components/chat/MessageRow.tsx` (bot badge), `i18n/locales/en.ts` / `vi.ts` (new `webhooks.*` keys per `i18n-localization.md:53`).

## Trade-offs

- **Reusing `MANAGE_CHANNELS` vs. adding `MANAGE_WEBHOOKS`**: `packages/shared/src/permissions.ts` has no webhook-specific bit today, and every existing role that can create/edit channels already controls what posts into them; a new permission would need every existing role migrated to grant it, which `member-bans.md:105`'s reasoning for reusing `MANAGE_SERVER` over a new permission already established as the repo's preferred path. Cost: a role that can manage a channel's structure but should not be trusted with an external posting URL cannot be split out later without a permission migration.
- **Synthetic `User` row per webhook vs. a nullable `Message.authorId`**: making `authorId` nullable is a breaking schema and query change touching every `include: { author: ... }` call across the messages module (at least 6 call sites read); a dedicated `User` row keeps every existing message-formatting and permission-adjacent join working unchanged, at the cost of one extra "fake user" row per webhook that must be excluded from real-member lists (mentions, presence, `@everyone`) via `isWebhook`.
- **Per-message name/avatar override columns vs. always using the webhook's stored name**: Discord-style webhooks let each POST supply a different name (e.g., one webhook, per-event different bot personas); storing per-message overrides preserves that without rewriting history. Cost: two extra nullable columns on `Message`, and `formatMessage` must resolve them.
- **SHA-256 token hash vs. bcrypt**: the posting endpoint needs a single indexed lookup by hash (potentially under load from a busy integration), which `bcrypt.compare` cannot do without iterating candidates; this repo already accepts SHA-256 for the same reason on password-reset tokens (`password-reset.service.ts:12`), so the precedent is followed rather than introduced.

## Risks & Rollback

- **Risk**: an integration author who leaks the URL (accidentally committed, pasted in a public channel) grants message-posting until someone notices and regenerates it — there is no expiry. Mitigated by the one-time display and the Regenerate action; no automatic rotation is in scope.
- **Risk**: a compromised webhook can flood a channel; the per-token rate limit (30/min) caps this but does not prevent a burst of spam messages before anyone revokes it.
- **Risk**: `User.isWebhook` rows must be excluded everywhere real members are enumerated (member list, `@everyone` mention expansion, presence) — missing one call site would leak a fake "member" into a list. Every such call site must be grepped and checked during implementation, not assumed from this doc.
- **Rollback**: revert code; both migrations are additive (new table, new nullable columns, new boolean with a default) so no backfill or data loss on rollback.

## Test Plan

Not covered by automated tests per `RULE.md:77`. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`.

- **Manual**: a member with `MANAGE_CHANNELS` creates a webhook named "CI Bot" in `#deploys` → copies the URL → `curl -X POST <url> -H 'Content-Type: application/json' -d '{"content":"Build passed","username":"CI"}'` → message appears live in another open client with the "CI" name and a bot badge, author is not a real member.
- **Manual**: regenerate the webhook → the old URL now returns `404` on the same `curl` command; the new URL works.
- **Manual**: delete the webhook → the URL returns `404`; the webhook no longer appears in the settings list; the action appears in the server's audit log.
- **Failure case**: `POST` with an empty `content` and no `username` override → `400`; `POST` to a webhook ID that exists but with a wrong token → `404`, not `401`/`403`.

## Deployment Notes

- Run migration `20260917010000_add_incoming_webhooks` before deploying the API.
- New i18n keys ship in both `en` and `vi` in the same change, per `docs/features/i18n-localization.md:11`.
- No new env var: the returned URL is built from the API's existing public base URL configuration.
