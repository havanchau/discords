# UI Design Spec

Canonical UI rules now live in `docs/design-rules.md`.

This file is intentionally short to avoid duplicated design-token, layout, typography, spacing, and component rules. Use it as a product-facing summary of what the UI should feel like; use `docs/design-rules.md` when implementing CSS or React UI.

## UI Goal

The interface should feel like a real, dense communication product:

- Discord-like app shell.
- Dark-first visual system.
- Practical information density.
- Clear realtime feedback.
- Accessible controls.
- Responsive layouts that preserve the chat workflow.

## Primary Surfaces

- Auth screens.
- Server rail.
- Channel sidebar.
- Chat header.
- Message timeline.
- Composer.
- Member sidebar.
- Settings modals.
- Friends and direct messages.
- Voice and screen-share controls.
- Attachment previews.

## UX Acceptance Criteria

- The first authenticated screen is the usable app shell, not a landing page.
- Users can scan servers, channels, messages, and members without excessive whitespace.
- Loading, empty, error, unauthorized, and pending states are visible.
- Icon-only actions have labels or titles.
- Message actions do not shift the timeline layout.
- The composer remains reachable on mobile.
- Realtime events are reflected without full page refreshes.
- Visual changes follow `docs/design-rules.md`.

## Implementation Reference

- UI rules: `docs/design-rules.md`
- App shell: `apps/web/src/AppShell.tsx`
- Workspace navigation: `apps/web/src/components/WorkspaceSidebar.tsx`
- Chat surface: `apps/web/src/components/ChatPanel.tsx`
- Member surface: `apps/web/src/components/MemberSidebar.tsx`
- Settings surface: `apps/web/src/components/SettingsModal.tsx`
- Call surface: `apps/web/src/hooks/useChannelCall.ts`
