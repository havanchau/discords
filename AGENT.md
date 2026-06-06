# Agent Guide

> **⚠️ BEFORE ANY TASK**: If this task touches frontend code, CSS, UI components, or styles — you MUST first read `DISCORD_UI_SKILL.md` and `docs/design-rules.md` in full. Use the **`ui-polish`** skill. These are non-negotiable constraints, not suggestions.

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

## Task Checklist Rules

Before implementing any task, create a checklist of the concrete work items.

- Use unchecked items (`- [ ]`) for work that has not been completed.
- Mark an item checked (`- [x]`) only after that exact work is genuinely done and verified.
- Never check a task that is still pending, partially complete, untested, blocked, or only assumed to work.
- Update the checklist as implementation progresses instead of marking everything done at the end.
- If scope changes, add or revise checklist items so the list stays truthful.

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

## UI Guidance — CRITICAL

> **READ `DISCORD_UI_SKILL.md` BEFORE ANY UI WORK.** It is the mandatory rulebook.

The app MUST look like Discord's real desktop client — a dense, warm-dark communication tool.

### Mandatory visual rules:

- **Colors**: Use ONLY the CSS custom properties from `DISCORD_UI_SKILL.md`. NEVER use neon cyan (`#00e5ff`), neon pink (`#ff1fb8`), neon lime (`#00ff95`), or any glowing/gradient effects.
- **Backgrounds**: Flat solid warm-dark grays (`#1e1f22`, `#2b2d31`, `#313338`). NO gradients on panels. NO `linear-gradient()` or `radial-gradient()` on the app shell, server rail, channel sidebar, chat area, or member sidebar.
- **Brand color**: Discord Blurple `#5865f2` for primary actions. NOT cyan, NOT old blurple `#7289DA`.
- **Shadows**: Subtle `rgba(0,0,0,...)` only. NO colored glows, NO `box-shadow` with cyan/pink/lime.
- **Borders**: Minimal. Use background-color layering for panel separation, not decorative borders.
- **App shell**: `border-radius: 0`. NO rounded corners on the outer shell. NO border on the shell.
- **Libraries first**: For UI tasks, use established React UI, icon, accessibility, animation, and utility libraries already present in the project or approved for the task before writing custom styles.
- **Raw CSS restriction**: Do not write raw CSS for UI work unless it is strictly required to connect library output to existing Discord tokens, exact layout constraints, or targeted responsive fixes. Any unavoidable custom CSS must be minimal, token-based, component-scoped, and justified by the implementation context.

### Layout:

- Server rail (72px) → Channel sidebar (240px) → Chat area (flex) → Member sidebar (240px)
- Channel list grouped by category
- Main message timeline with proper grouping
- Compact composer with upload, voice, and message controls
- Context menus for message and channel actions

### Canonical references:

- **Mandatory skill file**: `DISCORD_UI_SKILL.md`
- **Design tokens and rules**: `docs/design-rules.md`
- **UX spec**: `docs/ui-design-spec.md`

## Verification Checklist

Before considering a change complete:

- Typecheck passes.
- Lint passes.
- Relevant unit, integration, or smoke tests pass.
- Auth and permission paths were considered.
- Empty, loading, error, and unauthorized states are handled.
- Mobile layout does not overlap or hide primary controls.
