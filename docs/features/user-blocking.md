# Feature Spec: User Blocking

Blocking lets a user stop another user from befriending or privately messaging them.

## Goal

A user can block and unblock anyone they share a surface with, and a block is enforced server-side on every private social path.

Acceptance criteria:

- `POST /friends/blocks` blocks a user, removes any friendship or pending request between the two, and is idempotent.
- `DELETE /friends/blocks/:userId` removes only a block the caller created.
- While a block exists in either direction: friend requests cannot be sent or accepted, a 1-1 DM cannot be opened, and messages cannot be sent in an existing 1-1 DM.
- The blocked user cannot remove the block.
- `GET /friends` returns `blocked` as the list of users the caller blocked.

## Scope

- **In scope**: block model, block/unblock endpoints, enforcement in friends and 1-1 DMs, migration of legacy `BLOCKED` friend-request rows, Home sidebar block/unblock controls.
- **Out of scope**: hiding a blocked user's messages inside servers or group DMs, blocking from the member sidebar or DM header, notifying the blocked user.

## Current Behavior

- Blocking is a `FriendRequest.status = 'BLOCKED'` value set through `PATCH /friends/requests/:id` (`apps/api/src/modules/friends/friends.service.ts:113`). The row does not record who blocked whom.
- Either party can call `DELETE /friends/requests/:id` (`friends.service.ts:152`), so the blocked user can delete the block.
- `respond()` lets the requester set `BLOCKED` and lets the receiver set `ACCEPTED`, so a blocked receiver can turn a block into a friendship.
- `respond()` creates a notification telling the other user their request was marked "blocked".
- `DirectMessagesService.createMessage` (`direct-messages.service.ts:60`) has no friendship or block check, so an existing conversation keeps working after a block.
- Blocking is only offered on incoming requests (`components/home/FriendRequestList.tsx`).

## Changes

### Rules

- A block is directional: `blockerId` blocked `blockedId`. Enforcement checks both directions, so either user's block stops the interaction.
- Blocking deletes every `FriendRequest` row between the two users (pending, accepted, or legacy blocked) in the same transaction.
- Blocking yourself returns `400`. Blocking a missing user returns `404`.
- Friend request create or accept with a block in either direction returns `403 You cannot send a friend request to this user` / `403 You cannot accept this friend request`.
- `POST /friends/:userId/dm` with a block returns `403 You cannot message this user`.
- `POST /direct-conversations/:id/messages` in a non-group conversation with a block returns `403 You cannot message this user`. Group DMs are not affected (see [group-dm.md](group-dm.md)).
- No notification is created for a block. Both users receive `friend:updated` so their friend lists refresh; the payload carries no block details.
- `PATCH /friends/requests/:id` with `status: 'BLOCKED'` is kept for compatibility and now blocks the other party of that request on behalf of the caller.

### Legacy data

Existing `FriendRequest` rows with status `BLOCKED` are converted to blocks with `blockerId = receiverId` and `blockedId = requesterId` (the only UI path that created them was the receiver's "Block" button), then deleted. The `BLOCKED` enum value stays to avoid an enum rewrite.

## Technical Approach

### Data model

```prisma
model UserBlock {
  blockerId String
  blockedId String
  createdAt DateTime @default(now())
  blocker   User @relation("UserBlocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   User @relation("UserBlocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@id([blockerId, blockedId])
  @@index([blockedId])
}
```

Migration `20260915000000_add_user_blocks`: create table, copy legacy rows with `INSERT ... SELECT ... ON CONFLICT DO NOTHING`, delete the legacy rows.

### API

| Method   | Path                      | Body         | Response                                                                             |
| -------- | ------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `GET`    | `/friends`                | —            | `{ friends, pendingIncoming, pendingOutgoing, blocked: Array<{ user, createdAt }> }` |
| `POST`   | `/friends/blocks`         | `{ userId }` | `201 { block: { user, createdAt } }`                                                 |
| `DELETE` | `/friends/blocks/:userId` | —            | `200 { ok: true }`                                                                   |

`POST /friends/blocks` is rate limited to 30 requests per minute.

### Files

- `apps/api/prisma/schema.prisma`, new migration.
- `apps/api/src/modules/friends/user-blocks.ts`: `findBlockBetween(prisma, userA, userB)` query helper, shared with the DM module (same pattern as `messages/unread-counts.ts`).
- `apps/api/src/modules/friends/friends.controller.ts`, `friends.service.ts`, `dto/block-user.dto.ts`.
- `apps/api/src/modules/direct-messages/direct-messages.service.ts`: block check on send.
- `apps/web/src/api.ts`: `BlockedUserEntry`, `FriendsSummary.blocked`.
- `apps/web/src/hooks/useDirectMessages.ts`: `blockUser`, `unblockUser`.
- `apps/web/src/components/home/FriendsList.tsx`, `FriendRequestList.tsx`, `BlockedUsersList.tsx`, `HomeSidebar.tsx`.

## Trade-offs

- **Separate `UserBlock` table vs. adding `blockedById` to `FriendRequest`**: chosen the table. A block must exist without a friend request (for example blocking a DM partner), and must survive the request being deleted. Cost: one extra lookup on send paths, indexed by primary key.
- **Bidirectional enforcement**: Discord hides content rather than refusing it, but this app has no hidden-message rendering. Refusing sends in both directions is simpler and leaks only that some block exists, which Discord also leaks by refusing DMs.
- **Legacy conversion guess**: rows cannot say who blocked. Mapping to the receiver matches the only UI path; a wrong guess only means the other user can lift the block, which is the pre-existing behavior.

## Risks & Rollback

- **Risk**: the `GET /friends` `blocked` shape changes. The web client ships in the same change; no other client exists.
- **Rollback**: revert the code. The migration's data conversion is not reversible automatically; a down script would re-create `BLOCKED` friend requests from `UserBlock` rows.

## Test Plan

- **Manual**: user A blocks friend B from the Friends list → B disappears for both, B cannot re-add A, the existing A/B DM refuses new messages for both; A unblocks from the Blocked list → B can send a request again.

## Deployment Notes

- Run migration `20260915000000_add_user_blocks` before deploying the API.
- No new environment variables.
