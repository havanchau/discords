# AGENT.md

## Project Context

This repository is intended for a Discord clone. Build the product as a real-time communication app with servers, channels, direct messages, member roles, presence, notifications, and media-friendly chat.

Preferred stack unless the project later chooses otherwise:

- TypeScript for app and tooling code.
- React/Next.js for the web client.
- Node.js API routes or a dedicated Node backend for server logic.
- WebSocket transport for real-time events.
- PostgreSQL for durable data.
- Prisma or another typed ORM for database access.
- Object storage for uploaded files and avatars.

## Agent Operating Rules

1. Read existing code and configs before editing.
2. Keep changes scoped to the requested feature or fix.
3. Preserve user work. Do not revert unrelated changes.
4. Prefer existing local patterns over introducing new architecture.
5. Add tests for behavior that can regress, especially permissions, message delivery, auth, and persistence.
6. Do not commit secrets, tokens, database URLs, private keys, or generated build output.
7. Use clear names for domain concepts: `server`, `channel`, `member`, `role`, `message`, `conversation`, `presence`, `notification`.

## Implementation Priorities

- Correct permission checks before UI polish.
- Reliable message ordering and delivery semantics before advanced chat features.
- Accessible, responsive layouts before animation.
- Simple data models before generic abstractions.
- Observable failures with useful logs before silent fallbacks.

## Real-Time Events

Use explicit event names and typed payloads. Suggested namespaces:

- `message:create`
- `message:update`
- `message:delete`
- `channel:create`
- `channel:update`
- `channel:delete`
- `member:join`
- `member:leave`
- `presence:update`
- `typing:start`
- `typing:stop`

Events that mutate state must be authorized on the server. The client may optimistically render but must reconcile with server responses.

## Data Safety

- Validate all input at API boundaries.
- Check membership before reading server or channel resources.
- Check role permissions before write operations.
- Use database transactions for multi-row changes such as server creation, member creation, and role assignment.
- Soft-delete user-generated content when product requirements need auditability.

## UI Guidance

The app should feel like a dense communication tool, not a landing page. Prefer:

- Sidebar server switcher.
- Channel list grouped by category.
- Main message timeline.
- Member list on larger screens.
- Compact composer with upload and emoji controls.
- Context menus for message and channel actions.

Avoid decorative marketing sections inside the app shell.

## Verification Checklist

Before considering a change complete:

- Typecheck passes.
- Lint passes.
- Relevant unit or integration tests pass.
- Auth and permission paths were considered.
- Empty, loading, error, and unauthorized states are handled.
- Mobile layout does not overlap or hide primary controls.
