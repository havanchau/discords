# Feature Spec: User Profile

Profile banner, about me, pronouns, expiring custom status, per-server nickname and avatar, and one reusable profile card that shows them.

## Goal

A member can present themselves differently per server and see a complete profile card for anyone they share a server or a conversation with.

Acceptance criteria:

- A user sets banner image, about me, and pronouns in Settings; all three render on their profile card.
- A user sets a custom status with optional emoji and an expiry of 30 minutes, 1 hour, 4 hours, today, or never; it appears next to their name and disappears on its own when it expires.
- A user sets a nickname and an avatar per server; that server's member list, message authors, and profile card use them, and every other server keeps the account-level values.
- Clicking an avatar in the member sidebar, in a channel message, or in a direct message opens the same profile card.
- The card shows avatar, banner, display name, username, pronouns, custom status, about me, roles, server join date, and account creation date, with actions to send a direct message and to add a friend.
- Nickname, avatar, and custom status changes reach other open clients without a reload.

## Scope

- **In scope**: `User.bannerUrl`, `pronouns`, `customStatusText`, `customStatusEmoji`, `customStatusExpiresAt`; `ServerMember.avatarUrl`; the profile read endpoint; the reusable profile card; the Settings controls; realtime propagation.
- **Out of scope**: profile accent colour and profile themes, animated banners, badges, connected accounts, mutual servers and mutual friends lists, per-server about me, profile view for a user with no shared server or conversation, moderator editing of another member's nickname beyond what `PATCH /servers/:serverId/members/me` already allows.

## Current Behavior

- `User` has `avatarUrl` and `bio`, no banner, pronouns, or custom status (`apps/api/prisma/schema.prisma`).
- `UserStatus` is `ONLINE | OFFLINE | IDLE | DND | INVISIBLE` (`apps/api/prisma/schema.prisma`); it is presence, not a custom status message.
- `ServerMember` already has `nickname` and no per-server avatar (`apps/api/prisma/schema.prisma`).
- Nickname is settable only through `/nick` (`apps/web/src/utils/slashCommands.ts:10`, `apps/web/src/utils/executeSlashCommand.ts:59`) which calls the existing endpoint handled at `apps/api/src/modules/servers/servers.service.ts:202-213` and writes a `MEMBER_NICKNAME_UPDATE` audit entry. There is no UI control for it.
- A profile popover already exists but only in the member sidebar, built inline, with a decorative empty banner element and no pronouns, custom status, join date, or actions (`apps/web/src/components/MemberSidebar.tsx:148-172`).
- Message authors and direct message participants render an avatar with no profile affordance.
- `UpdateMeDto` accepts `displayName`, `bio`, `status`, `avatarUrl`, with an uploaded-image URL pattern (`apps/api/src/modules/users/dto/update-me.dto.ts:19-27`).
- `GET /users/me` and `PATCH /users/me` select a fixed field list (`apps/api/src/modules/users/users.service.ts:12-23`, `:27-40`); after this change both select through `PROFILE_USER_SELECT` in `apps/api/src/modules/users/user-profile.ts`, so the session user and the profile card cannot drift apart.
- `presence:update` and `server:member-updated` already exist (`packages/shared/src/realtime-events.ts:39`, `:29`).

## Changes

### Rules

- `bannerUrl` and `ServerMember.avatarUrl` accept only uploaded-image URLs, validated with the same pattern already used for `avatarUrl`.
- `pronouns`: optional, at most 40 characters, single line.
- `bio` (about me) keeps its existing 280-character limit.
- `customStatusText`: optional, at most 128 characters. `customStatusEmoji`: optional, a single Unicode emoji or a `:name:` server emoji reference, at most 64 characters to match the reaction limit raised in [custom-emoji.md](custom-emoji.md).
- `customStatusExpiresAt`: optional. The client sends an absolute UTC timestamp computed from the chosen preset; the server rejects a timestamp more than 24 hours ahead.
- An expired custom status is treated as absent on every read. No scheduled job clears it; the row is cleaned up opportunistically on the owner's next profile write.
- Per-server nickname and avatar: a member sets their own. Display resolution is `ServerMember.nickname ?? User.displayName` and `ServerMember.avatarUrl ?? User.avatarUrl`, applied consistently in the member list, message authors, and the profile card.
- Profile read authorization: the requester may read a profile only if they share at least one server with the target or share a direct conversation with them. Otherwise `404`, not `403`, so the endpoint does not confirm that an account exists.
- A blocked relationship in either direction returns `404` for the same reason, consistent with [user-blocking.md](user-blocking.md).
- Audit: the existing `MEMBER_NICKNAME_UPDATE` entry is reused; a per-server avatar change writes `MEMBER_PROFILE_UPDATE` with `{ avatarUrl: boolean }` and never the URL itself. Each entry is written only when the request actually carried that field.
- `PATCH /servers/:serverId/members/me` writes only the fields the request carried, so setting an avatar cannot clear a nickname that `/nick` set, and the reverse.
- Realtime: `presence:update` gains `customStatus` and is emitted to the author's servers after a custom-status write; `server:member-updated` is emitted after a nickname or per-server avatar change. Both payloads are **partial** — a listener merges only the keys present, so a nickname change cannot clear `timeoutUntil` and a presence connect cannot clear a custom status.

### Client

- `ProfileCard` component owns the whole card and is rendered from three call sites: the member sidebar popover, a message author avatar (`components/chat/MessageRow.tsx`), and the direct message header (`components/home/HomeDirectMessageView.tsx`). Each one passes `isOpen`, because a Radix popover renders its content before opening and the card must not fetch until it does.
- `useUserProfile(userId, serverId?)` fetches on open, with explicit loading, empty, error, and unauthorized states; results are cached per `userId + serverId` for the session.
- Settings gains a "Profile" section covering banner upload with preview and remove, pronouns, about me, and a custom status editor with emoji picker (reusing `EmojiPicker` from [custom-emoji.md](custom-emoji.md)), text field, and expiry preset select built on the existing `SettingsSelect`.
- Settings gains a "Server profile" section (`components/settings/ServerProfileSection.tsx`), rendered inside the profile dialog and shown only while a server is selected and the viewer is a member of it, with nickname and per-server avatar. Its own actions live in `useSettingsActions` rather than growing the profile form, so a server-profile save does not touch account fields.
- The custom status expiry is enforced server-side in `toCustomStatus`, which every read goes through, so an expired status never reaches the client at all.
- Expiry is chosen as a preset (never / 30 minutes / 1 hour / 4 hours / today); the client converts it to an absolute UTC timestamp so the stored value does not depend on when the server processed the request. "Never" sends `null`, which clears a stored expiry.
- `/nick` keeps working unchanged.

## Technical Approach

### Data model

```prisma
model User {
  // ...existing fields
  bannerUrl             String?
  pronouns              String?
  customStatusText      String?
  customStatusEmoji     String?
  customStatusExpiresAt DateTime?
}

model ServerMember {
  // ...existing fields
  avatarUrl String?
}
```

Migration `20260916002000_add_user_profile_fields`. All columns are additive and nullable; no backfill, no `NOT NULL` on a populated table.

### API

| Method | Path | Body | Response | Rate limit |
| --- | --- | --- | --- | --- |
| `PATCH` | `/users/me` | existing fields plus `bannerUrl?`, `pronouns?`, `customStatusText?`, `customStatusEmoji?`, `customStatusExpiresAt?` | `{ user }` with the new fields | 20/min |
| `GET` | `/users/:userId/profile?serverId=` | — | `{ profile }` | default |
| `PATCH` | `/servers/:serverId/members/me` | existing `nickname?` plus `avatarUrl?` | `{ member }` | 20/min |

`GET /users/:userId/profile` response:

```json
{
  "profile": {
    "id": "usr_1",
    "username": "demo",
    "displayName": "Demo",
    "avatarUrl": null,
    "bannerUrl": null,
    "pronouns": null,
    "bio": null,
    "status": "ONLINE",
    "customStatus": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "server": {
      "serverId": "srv_1",
      "nickname": null,
      "avatarUrl": null,
      "joinedAt": "2026-02-01T00:00:00.000Z",
      "roles": [{ "id": "rol_1", "name": "Moderator", "color": "#5865F2" }]
    }
  }
}
```

`server` is `null` when `serverId` is omitted or the target is not a member of it. `customStatus` is `null` when unset or expired, otherwise `{ text, emoji, expiresAt }`.

### Files

- API: `prisma/schema.prisma`, `modules/users/users.controller.ts`, `users.service.ts`, new `modules/users/user-profile.ts` (the shared select plus `toCustomStatus`), `dto/update-me.dto.ts`, `modules/servers/servers.service.ts`, `dto/update-nickname.dto.ts` (renamed intent: member self-profile).
- Shared: nothing. The profile and custom-status shapes are consumed only by the web client, which declares them in `apps/web/src/api.ts` alongside the other response types; the API cannot import the shared package (see [i18n-localization.md](i18n-localization.md)).
- Web: `src/api.ts`, `src/hooks/useUserProfile.ts`, `src/utils/memberIdentity.ts`, `src/components/profile/ProfileCard.tsx` and `ProfileCard.module.css`, `src/components/MemberSidebar.tsx` (replaces the inline popover), `src/components/chat/MessageRow.tsx`, `src/components/chat/types.ts`, `src/components/ChatPanel.tsx`, `src/components/home/HomeDirectMessageView.tsx`, `src/components/settings/ProfileSettings.tsx`, new `src/components/settings/ServerProfileSection.tsx`, `src/components/settings/types.ts`, `src/components/SettingsModal.tsx`, `src/hooks/useSettingsActions.ts`, `src/hooks/useDirectMessages.ts`, `src/hooks/useServerModeration.ts`, `src/hooks/useRealtimeSocket.ts`, `src/AppShell.tsx`.

`useSettingsActions.ts` is 651 lines and `MessageRow.tsx` is 484 against the 1000-line limit in `scripts/check-file-size.mjs:4`. The server-profile actions go in their own hook rather than growing `useSettingsActions.ts`.

### Display name resolution

One helper, `resolveMemberIdentity(user, member)` in `src/utils/memberIdentity.ts`, returns
`{ displayName, avatarUrl }` and is the only place the fallback chain lives. Every surface that
renders a member imports it, so a future per-server field cannot drift between the member list and
the message list.

The message list needs the same resolution for every author, and a message payload carries the
account user, not the membership. `buildMemberIdentityMap(server.members)` builds a lookup once per
member-list change in `AppShell` and rides along on `ChatPanelSession`, so a row costs a map read
rather than a scan. Direct messages pass an empty map: they are not server-scoped, so the account
identity is the right one there.

## Trade-offs

- **Lazy expiry vs. a scheduled job**: reads already have to handle a status that expired a second ago, so a cron job would remove rows without removing that check. Lazy expiry keeps the feature to zero moving parts. Cost: expired text stays in the database until the user writes again, and any future query that reads the column directly must remember the check — which is why the check lives in one mapper.
- **Per-server avatar on `ServerMember` vs. a separate `MemberProfile` table**: one nullable column reuses the row every membership query already loads, so no extra join anywhere. Cost: if per-server about me, pronouns, and banner are added later, `ServerMember` grows into a profile table and should be split then.
- **A dedicated profile endpoint vs. widening the member list payload**: the member list is loaded for every server open and is already a performance-sensitive batch (see [performance-optimization.md](performance-optimization.md)); banner, about me, and pronouns are only ever read one profile at a time. Cost: one request when a card opens, mitigated by session caching.
- **`404` vs. `403` for an unrelated or blocked user**: `403` confirms the account exists and turns the endpoint into a username-enumeration oracle. Cost: a genuine permission problem is harder to tell from a typo when debugging; the server log records the real reason.
- **Reusing `PATCH /servers/:serverId/members/me` vs. a new endpoint**: the nickname path, its permission check, and its audit write already exist at `servers.service.ts:202-213`; adding one field there keeps `/nick` and the new UI on the same code path. Cost: the DTO name no longer matches what it carries and is renamed.
- **Storing an absolute `expiresAt` vs. a duration**: an absolute timestamp is unambiguous across clients and needs no server clock arithmetic on read beyond a comparison. Cost: a client with a wrong clock can send a skewed timestamp, bounded by the 24-hour ceiling.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- No shared-package types were added; the API cannot import `@discord-clone/shared`, and only the web client needs these shapes.
- The profile card is not wired into the direct-message *list* rows, only the conversation header: a row is a conversation, not a person, and a group row has no single profile to open.
- `presence:update` and `server:member-updated` became partial payloads. Both already had listeners that replaced fields wholesale, which would have cleared unrelated state; the listeners now merge.
- `PATCH /users/me` gained a 20/min rate limit, which it did not have before.
- Custom-status expiry is a preset list rather than a free timestamp, so the client never sends a value the server would reject.
- The profile fetch is cached per `userId + serverId` for the session and invalidated after any profile write, rather than only cached.

## Risks & Rollback

- **Risk**: banner uploads increase storage use per user. The existing upload size and type validation applies unchanged; no new upload path is introduced.
- **Risk**: a per-server avatar makes impersonation inside a server easier. The username is always shown on the card and is never overridable, which is the same protection Discord relies on.
- **Risk**: profile cards opening from message rows could fire a request per avatar click in a busy channel. The per-session cache and the 20/min write limit bound this; reads use the default limiter.
- **Risk**: `customStatusEmoji` accepting `:name:` means a card can reference a server emoji the viewer cannot resolve. It falls back to the literal text, matching the rule in [custom-emoji.md](custom-emoji.md).
- **Rollback**: revert the code; the migration is additive and leftover columns are inert. The member sidebar popover returns to its inline form.

## Test Plan

Automated tests are not kept in this repository (see `RULE.md`). Verification is `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:file-size`, `npm run docs:check`, `npm run ui:scan`, plus:

- **Manual**: set banner, pronouns, and about me → open your own card from the member sidebar → all three render; a second signed-in browser sees them after reopening the card.
- **Manual**: set a custom status expiring in 30 minutes → it shows next to your name in both browsers → change the expiry to a past time through the API → the card and the member list stop showing it without a reload of the other browser.
- **Manual**: set nickname and avatar in server A → server A shows them in the member list, the message author line, and the card → server B shows the account-level name and avatar.
- **Manual**: open a profile card from a channel message avatar and from a direct message header → the same card renders.
- **Failure case**: `GET /users/<id>/profile` for a user sharing no server and no conversation → `404`; after blocking that user → still `404`.
- **Failure case**: `PATCH /users/me` with `bannerUrl` pointing at an external host → `400`; with `customStatusExpiresAt` 48 hours ahead → `400`.
- **Layout**: card at 1440x900, 1366x768, and 390x844; long about me text wraps and does not overflow the card.

## Deployment Notes

- Run migration `20260916002000_add_user_profile_fields` before deploying the API.
- Deploy API before web; the web reads fields an older API does not return.
- No new environment variables. Banner uploads use the existing upload driver and count against the same Cloudinary quota.
