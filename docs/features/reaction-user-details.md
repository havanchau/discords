# Feature Spec: Reaction User Details

Brings transparency to message reactions by showing which users reacted with each emoji.

## Goal

Enable users in channel text messages, thread messages, and direct messages to see who reacted with each emoji via rich tooltips when hovering over reaction buttons.

Acceptance criteria:
- Hovering over a reaction badge shows a tooltip listing the display names of members who added that reaction (e.g. "Demo User, Team Mate reacted with 👍").
- When more than 3 users reacted, format as "User 1, User 2, User 3 and N others reacted with :emoji:".
- If the current viewer reacted, their name is formatted nicely (or included as "You").
- Realtime reaction updates maintain reaction user lists across all connected clients.

## Scope

- **In scope**: Channel messages, thread messages, forum root posts, and direct messages.
- **Out of scope**: Dedicated "View Reactions" modal tab dialog (tooltip popover is sufficient and matches Discord standard UX).

## Current Behavior

- `formatMessage` in `apps/api/src/modules/messages/message.format.ts#L37-L67` computes `reactions` as `Array<{ emoji: string; count: number; me: boolean }>`.
- `DirectMessage` reactions in `apps/api/src/modules/direct-messages/direct-messages.service.ts` format reactions similarly.
- `MessageRow.tsx#L348-L361` renders reaction buttons with a basic title: `title={t('message.reaction.title', { emoji: reaction.emoji })}` ("Bày tỏ :emoji:").

## Changes

### 1. Data Model & API Contract

Update the `Reaction` payload returned in message objects:

```ts
export interface ReactionUser {
  id: string;
  displayName: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
  users: ReactionUser[];
}
```

- Include up to 10 recent users per reaction emoji in the `users` array.
- For `DirectMessage` realtime updates (`dm:reaction-updated`), include the `users` list.

### 2. Backend Implementation

- Include `user: { select: { id: true, displayName: true } }` when fetching `reactions` in `messageInclude` (`apps/api/src/modules/messages/message.format.ts`).
- Populate `users` array in `formatMessage` and `formatDirectMessages`.

### 3. Frontend UI Component

- Update `MessageRow.tsx` and `ThreadMessageActions.tsx` reaction button tooltip:
  - Generate human-readable string:
    - 1 user: **"Demo User reacted with 👍"**
    - 2 users: **"Demo User and Team Mate reacted with 👍"**
    - 3 users: **"User 1, User 2, and User 3 reacted with 👍"**
    - >3 users: **"User 1, User 2, User 3, and N others reacted with 👍"**
  - Wrap reaction button with modern `<Tooltip>` component.

## Technical Approach

### Files Touched

1. `packages/shared/src/types/message.ts` — Update `Reaction` and add `ReactionUser`.
2. `apps/api/src/modules/messages/message.format.ts` — Update `messageInclude` and `formatMessage` to include `users`.
3. `apps/api/src/modules/direct-messages/direct-messages.service.ts` — Include `users` in DM reaction formatting.
4. `apps/web/src/components/chat/MessageRow.tsx` — Add `Tooltip` with formatted user list on reaction badges.
5. `apps/web/src/components/chat/ThreadMessageActions.tsx` — Add reaction user tooltip for thread messages.
6. `apps/web/src/i18n/locales/en/chat.ts` & `vi/chat.ts` — Add translation keys for reaction user tooltips.

## Risks & Verification Plan

### Automated Tests & Checks
- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm run db:seed` to verify seed data displays `[👍 2]` with tooltip "Demo User, Team Mate reacted with 👍".

### Manual Verification
- Mouse hover over `[👍 2]` badge in message list.
- Confirm tooltip displays "Demo User and Team Mate reacted with 👍".
