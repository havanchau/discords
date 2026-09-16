# Feature Spec: Member Bans

Removes a member from a server and prevents them from joining again until unbanned.

## Goal

Members with `BAN_MEMBERS` can ban and unban users, and banned users cannot rejoin through any invite.

Acceptance criteria:

- `POST /servers/:serverId/bans` removes the membership (if any) and records the ban in one transaction.
- `POST /invites/:code/join` returns `403 You are banned from this server` for banned users and does not consume an invite use.
- The owner and the actor cannot be banned.
- `GET /servers/:serverId/bans` and `DELETE /servers/:serverId/bans/:userId` require `BAN_MEMBERS`.
- The removed user's open client drops the server immediately; other members see the member disappear.
- Ban and unban are recorded in the audit log.

## Scope

- **In scope**: ban model and endpoints, invite join enforcement, realtime removal for bans and the existing kick, ban controls in member settings, ban list in server settings.
- **Out of scope**: deleting the banned user's recent messages, temporary bans, role hierarchy between moderators, disconnecting the user from an active voice call.

## Current Behavior

- `BAN_MEMBERS` exists in `packages/shared/src/permissions.ts` and the role editor (`helpers.ts:14`) but nothing checks it.
- Kick deletes the membership (`servers.service.ts:216`) with no realtime event; the kicked user keeps the server in their sidebar and stays subscribed to its socket rooms until reload.
- `joinInvite` (`servers.service.ts:303`) accepts any authenticated user.

## Changes

### Rules

- Ban target is a `userId` that must exist (`404 User not found`); the user does not need to be a current member.
- Banning the server owner or yourself returns `403`.
- Banning an already banned user updates the reason and returns the existing ban (`200`).
- `reason` is optional, trimmed, up to 512 characters.
- Unbanning a user who is not banned returns `404 Ban not found`.
- Audit actions: `MEMBER_BAN` `{ userId, username, reason }`, `MEMBER_UNBAN` `{ userId }`.
- After a kick or ban commits, the server emits `server:member-removed` `{ serverId, userId, reason: 'KICK' | 'BAN' }` to `server:<id>` and `user:<userId>`, and removes the user's sockets from `server:<id>` and every `channel:<id>` room of that server.

### Client

- Receiving `server:member-removed` for yourself removes the server from the rail; if it is open, the app returns Home and shows "You were removed from <server>" (or "banned from").
- Receiving it for another user removes that member from the open server's member list.
- Member settings: "Kick member" (existing action, renamed label) and "Ban member" with an optional reason field and confirmation.
- Server settings: "Bans" section listing banned users with reason, date, and an Unban button; loading, empty, and error states.

## Technical Approach

### Data model

```prisma
model ServerBan {
  id         String   @id @default(cuid())
  serverId   String
  userId     String
  bannedById String
  reason     String?
  createdAt  DateTime @default(now())
  server     Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  user       User   @relation("BannedUser", fields: [userId], references: [id], onDelete: Cascade)
  bannedBy   User   @relation("BanIssuer", fields: [bannedById], references: [id])

  @@unique([serverId, userId])
  @@index([userId])
}
```

Migration `20260915003000_add_server_bans`.

### API

| Method   | Path                              | Body                  | Response                                                                  | Rate limit |
| -------- | --------------------------------- | --------------------- | ------------------------------------------------------------------------- | ---------- |
| `GET`    | `/servers/:serverId/bans`         | —                     | `{ bans: Array<{ id, user, reason, createdAt, bannedBy }> }` (latest 200) | default    |
| `POST`   | `/servers/:serverId/bans`         | `{ userId, reason? }` | `{ ban }`                                                                 | 20/min     |
| `DELETE` | `/servers/:serverId/bans/:userId` | —                     | `{ ok: true }`                                                            | 20/min     |

### Files

- API: `servers/server-moderation.service.ts` (ban, unban, list, kick moved here with the realtime emit), `servers.controller.ts`, `dto/create-ban.dto.ts`, `servers.service.ts` (`joinInvite` check), `servers.module.ts` (import `RealtimePublisherModule`), `realtime-publisher.service.ts` (`removeUsersFromRooms`, `serverRoom`).
- Web: `api.ts` (`ServerBanEntry`), `hooks/useServerModeration.ts` (subscribes to `server:member-removed` itself), `components/settings/MemberModerationSection.tsx`, `MemberRolesSettings.tsx`, `ServerBansSection.tsx`, `ServerSettings.tsx`. Ban and kick controls only render for members holding `BAN_MEMBERS` / `KICK_MEMBERS` (UI gating; the API enforces).

## Trade-offs

- **Ban table vs. `bannedAt` on `ServerMember`**: a ban must outlive the membership row it deletes, and must be possible for non-members, so it needs its own table.
- **Emitting on kick too**: it changes existing kick behavior slightly (adds an event), but without it the two removal paths would behave differently in the client for no reason.
- **No role hierarchy**: the codebase has none (`roles.service.ts`); adding one is a separate permission redesign.

## Risks & Rollback

- **Risk**: a banned user already inside a voice call keeps their media connection until they leave.
- **Rollback**: revert code; the migration is additive.

## Test Plan

- **Manual**: owner bans member B with a reason → B's client returns Home with a notice; B's invite join fails; ban appears in Server settings → Unban → B can join again.

## Deployment Notes

- Run migration `20260915003000_add_server_bans` before deploying the API.
