# Feature Spec: Realtime Text Chat

This specification covers persistent realtime text messaging, channel rooms, typing indicators, reactions, pins, and unread states across the web client and API.

## Goal

Provide high-concurrency, low-latency text chat within server channels and direct messages, maintaining strict permissions, cursor pagination, and reliable Socket.IO broadcasts.

## Scope

- **In Scope**:
  - Message CRUD operations (create, edit, soft-delete, pin/unpin).
  - Cursor-based message pagination and history fetching.
  - Socket.IO gateway connection, room join/leave authorization.
  - Reactions, typing indicators, read states, and unread badges.
  - Optional client-side channel passphrase message encryption (E2EE).
- **Out of Scope**:
  - Rich message formatting beyond basic markdown and attachments.
  - Multi-device cryptographic E2EE protocol (signal protocol key exchange).

## Current Behavior

- **API Gateway & Services**:
  - `apps/api/src/modules/realtime/realtime.gateway.ts`: Manages Socket.IO client connections, room subscriptions (`channel:<id>`, `user:<id>`), and handles socket authentication.
  - `apps/api/src/modules/messages/messages.service.ts`: Handles message persistence via Prisma, permission checks via `PermissionsService`, and broadcasts events through `RealtimePublisherService`.
  - `apps/api/src/modules/messages/messages.controller.ts`: Exposes REST endpoints for cursor-paginated message history, pins, and reactions.
- **Web Client Surfaces**:
  - `apps/web/src/components/ChatPanel.tsx`: Primary UI component rendering timeline, message items, composer, and reactions.
  - `apps/web/src/hooks/useMessageHistory.ts`: Manages message state, pagination cursors, and optimistic UI updates.
  - `apps/web/src/hooks/useRealtimeSocket.ts`: Establishes Socket.IO connection and listens to realtime event broadcasts.

## Changes

- Standardized Socket.IO event contracts in `packages/shared`.
- Enforced server-side permission checks before message delivery and mutation.
- Ensured database persistence occurs before emitting socket broadcast events.

## Technical Approach

- **Modules & Files**:
  - `apps/api/src/modules/messages/messages.service.ts`
  - `apps/api/src/modules/realtime/realtime.gateway.ts`
  - `apps/web/src/components/ChatPanel.tsx`
  - `packages/shared/src/index.ts` (Event payload types)
- **API Contracts**:
  - `GET /channels/:channelId/messages?cursor=:cursor&limit=50`
  - `POST /channels/:channelId/messages` -> Payload: `{ content, attachmentIds, parentId }`
  - `PATCH /messages/:messageId` -> Payload: `{ content }`
  - `DELETE /messages/:messageId` -> Soft delete (`deletedAt` timestamp set)
- **Database Schema**:
  - `Message` model in `apps/api/prisma/schema.prisma` indexed on `(channelId, createdAt)` for efficient pagination.

## Trade-offs

- **Cursor Pagination vs Offset Pagination**:
  - *Chosen*: Cursor pagination based on message ID/timestamp.
  - *Rationale*: Eliminates missing/duplicate items when new messages arrive while scrolling history.
  - *Cost*: Cannot jump directly to an arbitrary page number.
- **Persist-First Broadcasting vs Speculative Broadcasting**:
  - *Chosen*: Persist to database first, then broadcast to Socket.IO room.
  - *Rationale*: Ensures data integrity and prevents ghost messages on failure.
  - *Cost*: Adds database write latency (~5-15ms) to broadcast delivery time.

## Risks & Rollback

- **Risks**: High socket event volume causing gateway thread lag during spikes.
- **Rollback**: Revert socket payload schema changes; fallback to polling REST API endpoint `GET /channels/:channelId/messages` if gateway degrades.

## Test Plan

- **Automated Tests**:
  - Integration tests in `apps/api/src/modules/messages/messages.service.spec.ts` for permission and pagination correctness.
  - Hook tests in `apps/web/src/hooks/useMessageHistory.test.tsx`.
- **Manual Verification**:
  - Open two client sessions, join the same channel, verify real-time typing indicators, message delivery, edits, and reaction sync.

## Deployment Notes

- Ensure `WEB_ORIGIN` env variable on API includes WebSocket origin.
- No database migrations required for standard messaging updates.
