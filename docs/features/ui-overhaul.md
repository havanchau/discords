# Feature Spec: UI Overhaul & Codebase De-duplication

This specification covers the visual overhaul of the Discord clone web client interface to achieve authentic Discord client aesthetics, as well as the refactoring of monolithic files (`AppShell.tsx`, `useSettingsActions.ts`) and removal of duplicate prop/state logic.

## Goal

- Transform the web application UI from generic/AI-like styling into an authentic, highly usable, warm-dark Discord desktop client experience.
- Refactor web codebase to remove duplicate state management, reduce prop-drilling, and modularize `AppShell.tsx` (< 300 lines).

## Scope

- **In Scope**:
  - CSS design token refinements (surfaces, text contrast, Discord Blurple `#5865f2`, status indicators).
  - Micro-interactions: Server rail hover pills, active channel highlighting, message action hover bar, member presence badges.
  - Composer ergonomics: attachment previews, emoji toggle, typing indicator layout.
  - Codebase refactoring: Extract `useWorkspaceNavigation` and `useChatOrchestrator` hooks from `AppShell.tsx`.
  - Context Provider setup (`WorkspaceContext`) to eliminate 40+ pass-through props in `AuthenticatedWorkspace.tsx`.
  - Refactoring `useSettingsActions.ts` to reduce duplicate API call logic.
- **Out of Scope**:
  - Backend database schema changes.
  - Adding third-party UI framework dependencies outside existing stack.

## Current Behavior

- **`apps/web/src/AppShell.tsx` (lines 1 - 989)**: Serves as a monolithic state container holding 35+ state variables, direct API calls, socket event listeners, and manual prop-drilling into `AuthenticatedWorkspace`.
- **`apps/web/src/components/app/AuthenticatedWorkspace.tsx` (lines 1 - 61)**: Takes a massive props bundle (`workspace`, `chat`, `members`, `home`, `settings`) and forwards them downstream.
- **`apps/web/src/hooks/useSettingsActions.ts` (lines 1 - 646)**: Contains duplicated server, channel, and role mutation patterns with inline toast/error handlers.
- **`apps/web/src/styles/`**: Uses standard CSS classes that lack Discord's subtle micro-animations (e.g. server rail active pill indicator transitions, member item hover cards).

## Changes

1. **Design System & Visual Polish**:
   - Apply canonical Discord surface contrast (`#1e1f22`, `#2b2d31`, `#313338`, `#111214`).
   - Add Discord server rail pill animations (`::before` curved pseudo-element for active/hover states).
   - Enhance message row hover toolbar and reaction badges.
   - Fix status indicator badges (`#23a55a` online, `#f0b232` idle, `#f23f43` dnd).
2. **Codebase Modularization**:
   - Extract `useWorkspaceNavigation.ts` for server/channel switching and invitation logic.
   - Extract `useChatOrchestrator.ts` for message history, search, replies, and typing state.
   - Create `WorkspaceContext.tsx` to provide active server, channel, and UI panel context.
   - Reduce `AppShell.tsx` from 989 lines to < 300 lines.
   - Consolidate duplicated API handlers in `useSettingsActions.ts`.

## Technical Approach

- **Files Touched**:
  - `apps/web/src/AppShell.tsx`
  - `apps/web/src/components/app/AuthenticatedWorkspace.tsx`
  - `apps/web/src/components/WorkspaceSidebar.tsx`
  - `apps/web/src/components/MemberSidebar.tsx`
  - `apps/web/src/components/ChatPanel.tsx`
  - `apps/web/src/hooks/useWorkspaceNavigation.ts` [NEW]
  - `apps/web/src/hooks/useChatOrchestrator.ts` [NEW]
  - `apps/web/src/contexts/WorkspaceContext.tsx` [NEW]
  - `apps/web/src/hooks/useSettingsActions.ts`
  - `apps/web/src/styles/global.css`
  - `apps/web/src/styles/chat-layout.css`
  - `apps/web/src/styles/messages.css`

## Trade-offs

- **React Context vs Prop-Drilling**:
  - *Chosen*: React Context (`WorkspaceContext`) for workspace state.
  - *Rationale*: Eliminates fragile 40-prop object wrappers in `AuthenticatedWorkspace.tsx` while keeping component trees clean.
  - *Cost*: Requires wrapping workspace subtree with context provider; memoization (`useMemo`) used to prevent unnecessary re-renders.

## Risks & Rollback

- **Risks**: Regression in message timeline auto-scroll or channel state sync during hook extraction.
- **Rollback**: Revert `AppShell.tsx` and context hook changes; restore original prop-passing structure.

## Test Plan

- **Automated Tests**:
  - `npm run docs:check`: Validate all relative links and markdown structure.
  - `npm run typecheck`: Ensure zero TypeScript errors across all web components and hooks.
  - `npm run check:file-size`: Verify no file exceeds 1000 lines.
- **Manual Verification**:
  - Test server switching, channel creation, message typing/sending, DMs view, member list status indicators, and modal settings.

## Deployment Notes

- Frontend-only refactor; no backend API or database migrations required.
