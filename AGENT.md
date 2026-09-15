# Agent Guide

> **Before any UI task**: if the task touches frontend code, CSS, UI components, or styles, first read `DISCORD_UI_SKILL.md` and `docs/design-rules.md` in full.

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
2. Follow global `.claude` standards (`~/.claude/rules/workflow.md`, `~/.claude/rules/documentation.md`, `~/.claude/rules/self-review.md`).
3. Keep changes scoped to the requested feature or fix.
4. Preserve user work; do not revert unrelated changes.
5. Prefer existing local patterns over new architecture.
6. Add tests for behavior that can regress, especially permissions, auth, message delivery, and persistence.
7. Do not commit secrets, tokens, database URLs, private keys, generated build output, or local upload artifacts.
8. Use clear domain names: `server`, `channel`, `member`, `role`, `message`, `conversation`, `presence`, `notification`.
9. Maintain docs-driven development: write or update task specs in `docs/features/` or canonical doc owners before implementing code changes.

## Task Checklist Rules

Before implementing any task, create a checklist of the concrete work items.

- Use unchecked items (`- [ ]`) for work that has not been completed.
- Mark an item checked (`- [x]`) only after that exact work is genuinely done and verified.
- Never check a task that is still pending, partially complete, untested, blocked, or only assumed to work.
- Update the checklist as implementation progresses instead of marking everything done at the end.
- If scope changes, add or revise checklist items so the list stays truthful.

## Feature Completion Flow

Work through features one at a time:

1. Write or update the feature spec in `docs/features/` and wait for review before writing code.
2. Implement what the approved spec says; if the implementation must deviate, update the spec first.
3. Verify the feature (see Verification Checklist) and reconcile the spec with what was built.
4. Only then move on to the next feature.

## File Size Rules

- No source or documentation file should exceed 1000 lines.
- If a file would exceed 1000 lines, split it into focused modules or documents before continuing.
- Existing files over 1000 lines must be reduced as part of any substantial refactor that touches them.

## Implementation Priorities

- Correct permission checks before UI polish.
- Reliable message ordering before advanced chat features.
- Accessible and responsive layouts before animation.
- Simple data models before generic abstractions.
- Useful logs and explicit errors before silent fallbacks.

## Realtime Rules

Use explicit event names and typed payloads from `packages/shared`. Keep command events and broadcast events distinct instead of treating similarly named events as duplicate features. Add new event names to `packages/shared` before using them in the API or web client.

Representative client command events already modeled in shared contracts:

- `channel:join`
- `channel:leave`
- `message:create`
- `message:update`
- `message:delete`
- `reaction:toggle`
- `typing:start`
- `typing:stop`
- `voice:join`
- `voice:leave`
- `voice:state`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`

Representative server broadcast events already modeled in shared contracts:

- `message:created`
- `message:updated`
- `message:deleted`
- `reaction:updated`
- `presence:update`
- `voice:user-joined`
- `voice:user-updated`
- `voice:user-left`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`

Events that mutate or reveal state must be authorized on the server. The client may optimistically render but must reconcile with server responses.

## Data Safety

- Validate all input at API boundaries.
- Check membership before reading server or channel resources.
- Check role permissions before write operations.
- Use database transactions for multi-row changes.
- Soft-delete user-generated content when auditability matters.
- Keep browser-only encryption secrets out of API logs and persistence.

## UI Guidance

Read `DISCORD_UI_SKILL.md` and `docs/design-rules.md` before any UI work. This file does not restate UI rules or token values; those two documents own them, and `apps/web/src/styles/tokens.css` is the single source of truth for every colour, space, radius, and type step.

In short:

- Colours come only from semantic tokens (`--surface-*`, `--text-*`, `--border-*`, `--accent`, `--state-*`); no hardcoded colour literals in components.
- Reuse the primitives in `apps/web/src/components/ui/`; component styles live in a sibling `.module.css`.
- Both light and dark themes ship; check both at desktop and mobile widths.
- `npm run ui:scan` enforces tokens and contrast; do not lower its thresholds to pass it.

Canonical references:

- **Agent UI checklist**: `DISCORD_UI_SKILL.md`
- **Design rules**: `docs/design-rules.md`
- **UX acceptance criteria**: `docs/ui-design-spec.md`

## Verification Checklist

Before considering a change complete:

- Typecheck passes.
- Lint passes.
- Relevant unit, integration, or smoke tests pass.
- Auth and permission paths were considered.
- Empty, loading, error, and unauthorized states are handled.
- Mobile layout does not overlap or hide primary controls.
