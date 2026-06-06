# Agent Guide

This file gives implementation guidance for AI or human coding agents working in this repository. Product rules live in `RULE.md`; architecture details live in `docs/architecture.md`.

## Project Context

Build this project as a real-time Discord-like communication app with:

- Servers and channels.
- Direct messages.
- Member roles and permissions.
- Presence and notifications.
- Media-friendly chat.
- Voice, video, and screen-share foundations.

## Actual Stack

- TypeScript for app and tooling code.
- React and Vite for the web client.
- NestJS for the API.
- Socket.IO for realtime transport.
- PostgreSQL and Prisma for durable data.
- Local uploads and Cloudinary for media storage.
- Shared contracts in `packages/shared`.

## Operating Rules

1. Read existing code and configuration before editing.
2. Keep changes scoped to the requested feature or fix.
3. Preserve user work; do not revert unrelated changes.
4. Prefer existing local patterns over new architecture.
5. Add tests for behavior that can regress, especially permissions, auth, message delivery, and persistence.
6. Do not commit secrets, tokens, database URLs, private keys, generated build output, or local upload artifacts.
7. Use clear domain names: `server`, `channel`, `member`, `role`, `message`, `conversation`, `presence`, `notification`.

## Implementation Priorities

- Correct permission checks before UI polish.
- Reliable message ordering before advanced chat features.
- Accessible and responsive layouts before animation.
- Simple data models before generic abstractions.
- Useful logs and explicit errors before silent fallbacks.

## Realtime Rules

Use explicit event names and typed payloads from `packages/shared`.

Representative events:

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

Events that mutate or reveal state must be authorized on the server. The client may optimistically render but must reconcile with server responses.

## Data Safety

- Validate all input at API boundaries.
- Check membership before reading server or channel resources.
- Check role permissions before write operations.
- Use database transactions for multi-row changes.
- Soft-delete user-generated content when auditability matters.
- Keep browser-only encryption secrets out of API logs and persistence.

## UI Guidance

The app should feel like a dense communication tool, not a landing page.

Prefer:

- Server rail.
- Channel list grouped by category.
- Main message timeline.
- Member list on wider screens.
- Compact composer with upload, voice, and message controls.
- Context menus for message and channel actions.

Canonical UI implementation rules live in `docs/design-rules.md`.

## Verification Checklist

Before considering a change complete:

- Typecheck passes.
- Lint passes.
- Relevant unit, integration, or smoke tests pass.
- Auth and permission paths were considered.
- Empty, loading, error, and unauthorized states are handled.
- Mobile layout does not overlap or hide primary controls.
