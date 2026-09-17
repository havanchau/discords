# Feature Spec: Unread Scroll Position on Channel Load

Ensures users resume reading from where they left off by displaying the oldest unread message (or newest read message) upon loading or reloading a channel.

## Goal

When opening or reloading a channel/DM conversation:
- If unread messages exist, the message view automatically scrolls to the **oldest unread message** (or newest read message) instead of forcing the scroll to the absolute bottom.
- An **"Unread Messages"** (Tin nhắn chưa đọc) divider line is displayed directly above the oldest unread message.
- Marking messages as read is handled smoothly so the unread position is preserved upon reload until the user reads to the bottom.

Acceptance criteria:
- Opening a channel with unread messages centers/scrolls to the oldest unread message in the initial batch.
- A divider bar ("New Messages" / "Tin nhắn mới") marks the transition between read and unread messages.
- If all messages in the channel are read, the view scrolls to the newest message at the bottom.

## Scope

- **In scope**: Channel text messages and Direct Message conversations.
- **Out of scope**: Cross-channel global unread thread jumps (handling is scoped to channel load/reload).

## Current Behavior

- `openChannel` in `apps/web/src/AppShell.tsx#L380-L412` fetches the 50 newest messages via `GET /channels/:channelId/messages`.
- `AppShell.tsx` immediately calls `markChannelRead(channel.id, lastMessage?.id)` on load, overwriting `ReadState.lastReadMessageId` and `lastReadAt` with the newest message before the user views it.
- `MessageList.tsx#L76` virtualizer uses `anchorTo: 'end'`, defaulting the view position to the newest message at the bottom.

## Changes

### 1. API Payload Enhancement

Include the viewer's `lastReadMessageId` and `lastReadAt` in channel message list responses:
- `GET /channels/:channelId/messages` returns `{ messages, nextCursor, lastReadMessageId, lastReadAt }`.
- `GET /conversations/:id/messages` returns `{ messages, nextCursor, lastReadMessageId, lastReadAt }`.

### 2. Frontend Initial Scroll & Unread Divider

- **Read State preservation on load**:
  - In `AppShell.tsx`, capture `lastReadMessageId` / `lastReadAt` from response prior to marking channel read.
  - Find the first message in `messages` whose `createdAt > lastReadAt` (or message immediately following `lastReadMessageId`). This is the `firstUnreadMessageId`.
- **Message List Scrolling (`MessageList.tsx`)**:
  - When `firstUnreadMessageId` is present in `visibleMessages`:
    - Scroll `virtualizer` to the `firstUnreadMessageId` index (`align: 'start'`).
    - Render an **Unread Messages Divider** (`<div className={styles.unreadDivider}>`) above that message.
  - If no unread messages exist, default to bottom scroll (`align: 'end'`).
- **Deferred Read State Update**:
  - Delay calling `markChannelRead` until the user scrolls near the bottom or after initial unread view is rendered.

## Technical Approach

### Files Touched

1. `apps/api/src/modules/messages/messages.service.ts` — Return `lastReadMessageId` and `lastReadAt` in `listMessages`.
2. `apps/api/src/modules/direct-messages/direct-messages.service.ts` — Return `lastReadMessageId` and `lastReadAt` in DM `listMessages`.
3. `apps/web/src/AppShell.tsx` — Handle `lastReadMessageId` / `unreadMessageId` state and defer `markChannelRead`.
4. `apps/web/src/components/chat/MessageList.tsx` — Implement auto-scroll to unread target & render unread divider line.
5. `apps/web/src/components/chat/MessageRow.tsx` & `MessageList.module.css` — Styling for the unread divider line.
6. `apps/web/src/i18n/locales/en/chat.ts` & `vi/chat.ts` — Translation keys for `"Unread Messages"` divider.

## Risks & Verification Plan

### Automated Checks
- `npm run typecheck`
- `npm run lint`

### Manual Verification
- Send 5 test messages in `#general` using account B.
- Log in as account A and refresh the page (reload).
- Verify the chat window scrolls to the 1st unread message with a red `"NEW MESSAGES"` divider line above it.
