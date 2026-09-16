# Feature Spec: Direct Message Actions

Brings direct messages to parity with channel messages for edit, delete, reply, reactions, and pins.

## Goal

Members of a direct conversation can edit and delete their own messages, reply to a message, react with emoji, and pin messages, with every change delivered in realtime to the other members.

Acceptance criteria:

- Only the author can edit or delete a direct message; deleted messages keep their place in the timeline as "Message deleted".
- A reply shows a preview of the referenced message and jumps to it when clicked.
- Reactions toggle per user and emoji and show counts; the viewer's own reactions are highlighted.
- Any conversation member can pin or unpin; pinned messages are listed from the conversation header.
- All changes reach other members through `dm:updated`, `dm:deleted`, and `dm:reaction-updated` without a refetch.

## Scope

- **In scope**: API endpoints and realtime events for the five actions, a richer DM timeline row, a reply bar in the DM composer, a pinned messages popover.
- **Out of scope**: attachments in DMs, DM threads, DM search, message edit history.

## Current Behavior

- `DirectMessage` has `editedAt` and `deletedAt` columns but no endpoint sets them (`apps/api/prisma/schema.prisma`, `DirectMessage`).
- `DirectMessagesController` exposes list, send, and mark-read only (`direct-messages.controller.ts`).
- `DirectMessageTimeline` renders author, plain text, and time with no actions (`components/home/DirectMessageTimeline.tsx`).
- Realtime covers only `dm:created` and `dm:unread` (`useRealtimeSocket.ts`).

## Changes

### Rules

- Edit: author only (`403`), not on deleted messages (`404`), content trimmed, 1–4000 characters, sets `editedAt`.
- Delete: author only (`403`), soft delete (`content = ''`, `deletedAt = now`), clears the pin. Deleting twice is idempotent.
- Reply: `replyToMessageId` must reference a message in the same conversation (`404` otherwise). Replying to a deleted message is allowed; the preview shows "Message deleted".
- Reaction: toggle per `(messageId, userId, emoji)`; emoji string 1–64 characters; not on deleted messages (`404`).
- Pin: any conversation member toggles; not on deleted messages (`404`); at most 50 pinned messages per conversation (`400 Pin limit reached`).
- Every action requires conversation membership; non-members get `404 Conversation not found` so conversation ids are not confirmed.
- Blocks do not affect edit, delete, react, or pin; they only stop new messages ([user-blocking.md](user-blocking.md)).

### Message payload

Every endpoint and event returns direct messages in one shape:

```ts
{
  id, conversationId, authorId, author, content, createdAt, editedAt, deletedAt,
  replyToMessageId, replyToMessage: { id, authorId, author, content, deletedAt } | null,
  pinnedAt, pinnedById,
  reactions: Array<{ emoji: string; count: number; userIds: string[] }>
}
```

Reactions carry `userIds` instead of a viewer-specific `me` flag, because one realtime payload is broadcast to every member; the client derives `me`.

## Technical Approach

### Data model

- `DirectMessage`: add `replyToMessageId String?`, `pinnedAt DateTime?`, `pinnedById String?`, relation `reactions`, index `(conversationId, pinnedAt)`.
- New model:

```prisma
model DirectMessageReaction {
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())
  message   DirectMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([messageId, userId, emoji])
}
```

Migration `20260915001000_add_dm_message_actions` (additive only).

### API

| Method   | Path                                    | Body                             | Response              | Rate limit |
| -------- | --------------------------------------- | -------------------------------- | --------------------- | ---------- |
| `POST`   | `/direct-conversations/:id/messages`    | `{ content, replyToMessageId? }` | `{ message }`         | existing   |
| `GET`    | `/direct-conversations/:id/pins`        | —                                | `{ messages }`        | default    |
| `PATCH`  | `/direct-messages/:messageId`           | `{ content }`                    | `{ message }`         | 30/min     |
| `DELETE` | `/direct-messages/:messageId`           | —                                | `{ message }`         | 30/min     |
| `POST`   | `/direct-messages/:messageId/reactions` | `{ emoji }`                      | `{ message }`         | 60/min     |
| `POST`   | `/direct-messages/:messageId/pins`      | —                                | `{ pinned, message }` | 30/min     |

### Realtime

New shared constants in `packages/shared/src/realtime-events.ts`, emitted to `conversation:<id>` after the write commits:

- `dm:updated` — `DirectMessage` (edit, pin, unpin).
- `dm:deleted` — `DirectMessage`.
- `dm:reaction-updated` — `DirectMessage`.

### Files

- API: `direct-messages/direct-message-actions.controller.ts`, `direct-message-actions.service.ts`, `direct-message.format.ts` (include + formatter shared by both services), DTOs `update-direct-message.dto.ts`, `direct-message-reaction.dto.ts`, `create-direct-message.dto.ts` (add `replyToMessageId`).
- Web: `api.ts` types; `hooks/useDirectMessageActions.ts`; `components/home/DirectMessageRow.tsx`, `DirectMessageTimeline.tsx`, `DirectMessageComposer.tsx` (reply bar), `DirectPinnedMessages.tsx`, `HomeDirectMessageView.tsx`; realtime handlers in `hooks/useRealtimeSocket.ts`.

## Trade-offs

- **Pin columns on `DirectMessage` vs. a pin table like `MessagePin`**: chosen columns. A DM pin has no channel or per-pin metadata beyond who and when, so a table adds a join for nothing. Cost: the two message models store pins differently.
- **Separate `DirectMessageRow` vs. reusing channel `MessageRow`**: `MessageRow` depends on `ChatPanelMessageActions`, channel ids, E2EE state, threads, and attachments. Generalizing it would change a memoized, performance-tuned component. The DM row reuses the same UI primitives and markdown renderer instead.
- **`userIds` in reactions**: payload grows with reactors, bounded by conversation size (at most 10 members for groups).

## Risks & Rollback

- **Risk**: the DM timeline is not virtualized; long conversations render every row. Pagination already caps the initial load at 50 messages.
- **Rollback**: revert code; the migration is additive and can stay.

## Test Plan

- **Manual**: two browsers in the same DM → edit, delete, reply, react, pin from one; the other updates live; pinned popover lists and jumps to the message.

## Deployment Notes

- Run migration `20260915001000_add_dm_message_actions` before deploying the API.
