# Feature Spec: Group Direct Messages

Private conversations with up to ten people, outside any server.

## Goal

A user can start a group DM with several friends, name it, add more friends, remove members (owner), and leave, with membership changes applied in realtime.

Acceptance criteria:

- `POST /direct-conversations` creates a group with the caller plus 2–9 accepted friends.
- Groups never exceed 10 members; adding beyond that returns `400 Group is full`.
- Only accepted friends of the actor can be added; blocks in either direction between actor and target refuse the add.
- The owner can remove members; any member can leave; ownership passes to the longest-standing member when the owner leaves; the conversation is deleted when the last member leaves.
- Opening a 1-1 DM never returns a group conversation.
- Members receive `dm:conversation-updated`; a removed member receives `dm:conversation-removed` and stops receiving the group's events.

## Scope

- **In scope**: group fields on `DirectConversation`, create/rename/add/remove/leave endpoints, socket room membership updates, Home sidebar group creation dialog, group header menu.
- **Out of scope**: group icons, system messages for joins and leaves, converting a 1-1 DM into a group, invite links for groups.

## Current Behavior

- `DirectConversation` has no group, name, or owner fields (`schema.prisma`).
- `FriendsService.startDm` finds an existing conversation with both members using two `some` filters (`friends.service.ts:176`); a conversation that contains both users plus others would match.
- Sockets join every conversation room once on connect (`realtime.gateway.ts:609`); there is no way to join a room created later except the `conversation:join` event.
- The web client treats `members[0]` as the DM partner (`ConversationList.tsx`, `HomeDirectMessageView.tsx`).

## Changes

### Rules

- Create: `userIds` 2–9 unique ids, none equal to the caller; each must be an accepted friend of the caller with no block in either direction (`403 You can only add friends to a group`). `name` optional, trimmed, up to 100 characters.
- Rename: any member; empty name clears it. Groups only (`400 Only group conversations can be renamed`).
- Add member: groups only; actor must be a member; target must be an accepted friend with no block; already a member is a no-op success.
- Remove: `DELETE /direct-conversations/:id/members/:userId`. The caller may remove themself (leave). Removing someone else requires being the owner (`403`).
- Owner leaving transfers `ownerId` to the member with the earliest `joinedAt`. The last member leaving deletes the conversation and its messages.
- Sending in a group ignores blocks; only 1-1 conversations enforce them.
- DM notification title for groups: `New message in <group name>` when the group is named, otherwise `New group message from <author>`.

### Display name

The client shows `name` when set, otherwise the other members' display names joined by commas, truncated by CSS.

## Technical Approach

### Data model

- `DirectConversation`: `isGroup Boolean @default(false)`, `name String?`, `ownerId String?` (relation `User`, `onDelete: SetNull`).
- `DirectConversationMember`: `joinedAt DateTime @default(now())`.

Migration `20260915002000_add_group_dms` (additive; existing rows become 1-1 conversations).

### API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/direct-conversations` | `{ userIds: string[], name? }` | `201 { conversation }` |
| `PATCH` | `/direct-conversations/:id` | `{ name }` | `{ conversation }` |
| `POST` | `/direct-conversations/:id/members` | `{ userId }` | `{ conversation }` |
| `DELETE` | `/direct-conversations/:id/members/:userId` | — | `{ ok: true }` |

`conversation` matches the `GET /direct-conversations` item shape plus `isGroup`, `name`, `ownerId`. Create is rate limited to 10 per minute; member changes to 30 per minute.

### Realtime

- `RealtimePublisher.joinUsersToRoom(userIds, room)` and `removeUsersFromRooms(userIds, rooms)` use Socket.IO `socketsJoin` / `socketsLeave` on each user room, so already-connected sockets follow membership changes.
- `dm:conversation-updated` `{ conversationId }` to every current member's user room after create, rename, add, remove.
- Opening a new 1-1 DM (`POST /friends/:userId/dm`) also moves both users' sockets into the new conversation room, so DM actions and DM calls are delivered live without a reconnect.
- `dm:conversation-removed` `{ conversationId }` to the removed user's room.
- The client refetches `GET /direct-conversations` on `dm:conversation-updated` and drops the conversation on `dm:conversation-removed`.

### Files

- API: `direct-messages/direct-conversations.service.ts` (group lifecycle), controller routes, DTOs `create-group-conversation.dto.ts`, `update-conversation.dto.ts`, `add-conversation-member.dto.ts`; `friends.service.ts` (`isGroup: false` filter); `realtime-publisher.service.ts`.
- Web: `api.ts`; `hooks/useGroupConversations.ts`; `hooks/useHomeWorkspace.ts` (composes the Home hooks so `AppShell.tsx` stays under the 1000-line limit); `components/home/CreateGroupDialog.tsx`, `GroupConversationMenu.tsx`, `conversationDisplay.ts` (name/avatar helpers), `ConversationList.tsx`, `HomeDirectMessageView.tsx`, `HomeSidebar.tsx`.

## Trade-offs

- **Reuse `DirectConversation` vs. a new `GroupConversation` model**: reuse keeps messages, unread state, notifications, and DM actions working for groups with no duplication. Cost: every 1-1 lookup must filter `isGroup: false`.
- **Server-side room moves vs. client `conversation:join`**: moving sockets from the server is authoritative and works for users who are online but not looking at Home. Cost: relies on the single-instance Socket.IO adapter already assumed by call state.
- **Deleting empty groups**: avoids orphaned rows that no one can reach; messages are lost, which matches Discord.

## Risks & Rollback

- **Risk**: horizontal scaling would need the Socket.IO Redis adapter for `socketsJoin` across instances (same constraint as existing realtime rooms).
- **Rollback**: revert code; groups created in the meantime would render as conversations with several members.

## Test Plan

- **Automated** (`group-dm.int.test.ts`): create requires friends; size limit; non-owner cannot remove others; owner leave transfers ownership; last leave deletes; `startDm` ignores groups. Web unit tests for `conversationDisplayName`.
- **Manual**: A creates a group with B and C → all three see it live; A renames; C leaves → A and B update, C loses it; A removes B; A adds a new friend D.

## Deployment Notes

- Run migration `20260915002000_add_group_dms` before deploying the API.
