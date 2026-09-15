# Feature Spec: Member Timeout and Channel Slowmode

Two rate-control tools for moderators: silence a member for a period, and limit how often members post in a channel.

## Goal

Moderators can temporarily stop a member from sending messages and reactions, and can set a per-channel cooldown between messages.

Acceptance criteria:

- `PUT /servers/:serverId/members/:memberId/timeout` with `durationMinutes > 0` sets `timeoutUntil`; `0` clears it. Requires `KICK_MEMBERS`.
- A timed-out member gets `403 You are timed out until <ISO date>` when sending channel messages, thread replies, or reactions; the owner can never be timed out.
- A channel's `slowmodeSeconds` (0–21600, from a fixed list) makes a member wait that long between their own messages in the channel, returning `429 Slowmode is enabled. Try again in <n>s.`
- Members with `MANAGE_MESSAGES` or `MANAGE_CHANNELS`, and the owner, bypass slowmode.
- The composer shows the timeout or slowmode state before the user sends.

## Scope

- **In scope**: `timeoutUntil` on members, `slowmodeSeconds` on channels, enforcement in the messages service, socket send errors returned in the acknowledgement, moderation and channel settings controls, composer hints.
- **Out of scope**: blocking voice for timed-out members, slowmode inside threads, automatic moderation rules.

## Current Behavior

- `ServerMember` and `Channel` have no timeout or slowmode fields (`schema.prisma`).
- `MessagesService.createMessage` checks view and send permission only (`messages.service.ts:151`).
- Reactions require only view permission (`messages.service.ts:420`).
- A service exception in the `message:create` socket handler is not acknowledged; the client waits 5 seconds and shows "Message was not acknowledged" (`AppShell.tsx:360`).

## Changes

### Timeout rules

- Allowed `durationMinutes`: `0, 1, 5, 10, 60, 1440, 10080` (clear, 60s, 5m, 10m, 1h, 1d, 1w).
- Target must be a member of the server (`404`); cannot be the owner or the actor (`403`).
- Stored as an absolute UTC `timeoutUntil`; a past value means not timed out, so expiry needs no job.
- Enforced by `PermissionsService.requireNotTimedOut(userId, serverId)` in `createMessage`, `createThreadMessage`, and `toggleReaction`.
- Audit: `MEMBER_TIMEOUT` `{ userId, durationMinutes, timeoutUntil }`, `MEMBER_TIMEOUT_CLEAR` `{ userId }`.
- Realtime: `server:member-updated` `{ serverId, memberId, userId, timeoutUntil }` to `server:<id>`.

### Slowmode rules

- Allowed `slowmodeSeconds`: `0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600`.
- Applies to top-level channel messages only. The last message is the author's most recent top-level message in the channel, including deleted ones, so deleting does not reset the cooldown.
- `slowmodeRetryAfterSeconds(lastCreatedAt, slowmodeSeconds, now)` is a pure helper returning `0` or the whole seconds left (rounded up).
- Set through the existing `PATCH /channels/:channelId` (`MANAGE_CHANNELS`); included in the `CHANNEL_UPDATE` audit metadata.

### Socket acknowledgement

`message:create` acknowledges `{ error: string }` when the service throws an `HttpException`, instead of leaving the call unacknowledged. The client shows the message text. Other exceptions keep the current behavior.

### Client

- Member settings: "Timeout" select with the allowed durations and a "Remove timeout" action when active.
- Channel settings: "Slowmode" select.
- Composer: disabled with "You are timed out until <time>" while the current member is timed out; placeholder "Slowmode is enabled (<n>s)" and a countdown after the user's own send.

## Technical Approach

### Data model

- `ServerMember.timeoutUntil DateTime?`
- `Channel.slowmodeSeconds Int @default(0)`
- `Message` index `(channelId, authorId, createdAt)` for the last-message lookup.

Migration `20260915004000_add_timeout_and_slowmode`. Adding a column with a default to `Channel` and an index to `Message` locks those tables briefly; `CREATE INDEX` on a large `Message` table should run with `CONCURRENTLY` in production (noted in the migration file).

### API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `PUT` | `/servers/:serverId/members/:memberId/timeout` | `{ durationMinutes }` | `{ member: { id, userId, timeoutUntil } }` |
| `PATCH` | `/channels/:channelId` | adds `slowmodeSeconds?` | `{ channel }` |

### Files

- API: `permissions/permissions.service.ts`, `messages/slowmode.ts` (+ test), `messages/messages.service.ts`, `servers/server-moderation.service.ts`, `servers/dto/timeout-member.dto.ts`, `channels/dto/update-channel.dto.ts`, `channels/channels.service.ts`, `realtime/realtime.gateway.ts`.
- Web: `api.ts`, `hooks/useServerModeration.ts` (also subscribes to `server:member-updated`), `hooks/useComposerRestrictions.ts` (+ test), `utils/serverPermissions.ts` (+ test, shared with [server-events.md](server-events.md)), `components/settings/MemberModerationSection.tsx`, `MemberRolesSettings.tsx`, `ChannelSettings.tsx`, `hooks/useSettingsActions.ts`, `components/chat/MessageComposer.tsx`, `AppShell.tsx` (ack error). `hooks/useChannelMessageActions.ts` holds the channel edit/delete/react actions moved out of `AppShell.tsx` to keep it under the 1000-line limit.

## Trade-offs

- **`KICK_MEMBERS` for timeout vs. a new `MODERATE_MEMBERS` permission**: `RULE.md` groups kick, ban, timeout under member management, and existing moderator roles would silently lack a new permission. Cost: less granular than Discord.
- **Query-based slowmode vs. an in-memory or Redis cooldown**: the indexed lookup is exact across restarts and instances with one small query per send. Cost: two concurrent sends can both pass the check; acceptable for a cooldown.
- **Explicit timeout check vs. folding into `evaluateChannelPermission`**: a separate check yields a clear error message and keeps the pure permission evaluator unchanged.

## Risks & Rollback

- **Risk**: client clock skew only affects the countdown hint; the server is authoritative.
- **Rollback**: revert code; the migration is additive.

## Test Plan

- **Automated**: `slowmode.test.ts` (no previous message, inside window, boundary, rounding); `server-moderation.int.test.ts` (timeout blocks send and reaction, clear restores, owner refused, slowmode 429 and bypass for managers).
- **Manual**: owner times out B for 60s → B's composer is disabled and a forced send fails; after expiry B can send. Set slowmode 10s → B sends twice → second is refused with a countdown; owner can send freely.

## Deployment Notes

- Run migration `20260915004000_add_timeout_and_slowmode` before deploying the API. Consider building the `Message` index concurrently on large databases.
