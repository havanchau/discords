# Discord UI Redesign Plan — v2

## Summary

This plan defines an incremental, library-first UI refactor that makes the web client feel much closer to Discord's desktop app while reducing raw CSS, oversized components, and manual accessibility work.

The implementation must use Radix UI primitives per phase, `clsx` for class composition, existing `lucide-react` icons, and scoped CSS Modules for component styling. Do **not** use CVA for this project; the variant surface is small enough for token-based CSS classes plus `clsx`.

---

## Visual Direction

Use Discord dark theme proportions and spacing as the primary reference.

- **Server rail**: 72px width, `#1e1f22`-like background, circular icons with active pill indicator.
- **Channel sidebar**: `#2b2d31`-like background, compact rows, muted text, hover states.
- **Chat area**: `#313338`-like background, dense message rows, subtle hover toolbar.
- **Member sidebar**: `#2b2d31`-like background, role grouping, small status indicators.
- Avoid large cards, rounded dashboard panels, marketing-style gradients, glassmorphism, neon colors, and oversized spacing.
- No marketing-style gradients, neon glows, or bright dashboard colors in core shell, sidebar, chat, and member panels.
- Gradients are allowed only for intentional brand/banner areas.

---

## Discord-like Design Tokens

Define these tokens before any component work begins. All component CSS Modules must consume these tokens — no hardcoded colors or spacing values in component files.

```css
--color-bg-app
--color-bg-rail
--color-bg-sidebar
--color-bg-chat
--color-bg-elevated
--color-bg-input
--color-text-primary
--color-text-muted
--color-text-link
--color-interactive-normal
--color-interactive-hover
--color-interactive-active
--color-interactive-muted
--color-accent-blurple
--color-status-online
--color-status-idle
--color-status-dnd
--color-status-offline
--color-danger
--color-success
--radius-server-default
--radius-server-active
--spacing-channel-row
--height-channel-row
--height-message-composer
--height-server-rail
--motion-menu
--motion-server-icon
--motion-modal
--motion-sidebar
```

---

## Non-Negotiable Rules

- Every implementation task must start with a truthful checklist.
- No source file may exceed **1000 lines** after the refactor. If a file would exceed 1000 lines, split it into focused modules before continuing.
- **Do not split files mechanically just to satisfy line limits.** Each extracted module must have a clear responsibility and must not create excessive prop drilling. If a split component would need more than 15 props, reconsider whether a hook, context, or composition pattern is more appropriate.
- `AppShell.tsx`, `ChatPanel.tsx`, `SettingsModal.tsx`, `WorkspaceSidebar.tsx`, and `styles.css` must all be reduced below 1000 lines.
- Install UI dependencies per phase only when they are used in that phase.
- Keep global CSS limited to tokens, base reset, app-shell grid, and shared browser defaults.
- Use CSS Modules for component-specific styling.
- Do not add raw CSS unless it is strictly required for Discord tokens, exact layout constraints, targeted responsive fixes, or narrow component polish.
- **Preserve existing backend APIs, Socket.IO behavior, permissions, uploads, calls, and E2EE behavior.**
- **Do not rename socket event names, payload shapes, API DTOs, localStorage keys, encryption/decryption helpers, upload request fields, or permission check logic unless explicitly required by a new feature.**

---

## Context and State Rules

- Add context only for **low-frequency global state** (auth, theme, socket reference).
- Do **not** put frequently changing data — message lists, typing indicators, presence maps — directly into broad React contexts unless memoized selectors are used.
- Message lists, typing state, and presence state must stay in hooks or stores close to the components that consume them.
- Before extracting any hook, define an **event-to-hook ownership map** (e.g., which hook owns `message:created`, `presence:update`, `voice:active`) to avoid circular dependencies.

---

## Dependency Strategy

- **Phase 0A**: No new dependencies. Pin existing ones.
- **Phase 1**: Add `clsx`, `@radix-ui/react-tooltip`, `@radix-ui/react-dialog`, `@radix-ui/react-toast`, `@radix-ui/react-context-menu`.
- **Phase 2**: Add `@radix-ui/react-dropdown-menu`.
- **Phase 3**: Add `@radix-ui/react-popover`.
- **Phase 4**: Add `@radix-ui/react-tabs`, `@radix-ui/react-select`, `@radix-ui/react-switch`, `@radix-ui/react-checkbox`.
- Do **not** add `@radix-ui/react-scroll-area` unless native scrolling cannot satisfy the Discord visual and accessibility requirements.
- Do **not** add `react-window` until a measured channel with more than 500 visible messages shows poor scroll performance.

---

## Implementation Checklist

### Phase 0A: Safety And Tooling

Goal: make the baseline reproducible and verifiable. No behavior changes.

- [x] Pin all existing `package.json` and `apps/web/package.json` dependencies to exact versions.
- [ ] Commit a reproducible lockfile update.
- [x] Verify `npm run lint`, `npm run typecheck`, and `npm run build --workspace apps/web` pass on the current codebase.
- [x] Add a file-size check script that fails when tracked source files exceed 1000 lines.
- [x] Add a `ui:smoke` script and a static UI scan script so they are available from Phase 0B onward.
- [ ] Commit the `ui:smoke` script and static UI scan script.
- [x] Capture **before screenshots** of: auth screen, main chat (desktop + mobile), settings modal, DM view. Store in `docs/screenshots/before/`.

### Phase 0B: State Extraction

Only begin after Phase 0A passes all checks. Goal: make `AppShell` manageable for UI work, not redesign state management. Only extract hooks when a file is too large or is blocking UI work.

- [ ] Define the event-to-hook ownership map before writing any new hook.
- [ ] Extract AppShell state and side effects into focused hooks:
  - `useAuthSession`
  - `useServers`
  - `useMessages`
  - `useDirectMessages`
  - `useRealtimeSocket`
  - keep existing `useChannelCall`
- [ ] Add lightweight React context providers for auth, socket, and theme only. Follow the context rules above.
- [ ] Reduce `AppShell.tsx` below 1000 lines before starting Phase 1.
- [ ] Keep all extracted hooks **behavior-compatible** with current API calls and Socket.IO events.
- [ ] Run minimum merge checks before proceeding.

---

### Phase 1: Design System Foundation

- [ ] Define all Discord-like design tokens in `styles.css` (see token list above).
- [ ] Create `apps/web/src/components/ui`.
- [ ] Add `clsx`, Dialog, Tooltip, Toast, and ContextMenu dependencies.
- [ ] Add a shared `cn()` helper.
- [ ] Create reusable primitives:
  - `Button`, `IconButton`
  - `TextField`, `TextArea`
  - `Dialog`
  - `Tooltip`
  - `ContextMenu`
  - `Toast`
  - `Avatar`, `Badge`, `Skeleton`, `Banner`
- [ ] All primitives must consume design tokens — no hardcoded values.
- [ ] Move component-specific styles into CSS Modules.
- [ ] Keep `styles.css` only for root tokens, reset/base rules, app-shell layout, and global browser defaults.
- [ ] Define motion tokens: `--motion-menu: 100ms`, `--motion-server-icon: 150ms`, `--motion-modal: 200ms`, `--motion-sidebar: 300ms`.
- [ ] Add `prefers-reduced-motion` support.
- [ ] Add `focus-visible` styling to every primitive.
- [ ] Verify all interactive primitives meet minimum 32×32px target size.
- [ ] Add basic render tests (vitest + @testing-library/react) for each primitive.
- [ ] Reduce `styles.css` below 1000 lines.
- [ ] Run minimum merge checks. Capture after screenshots and compare with before.

---

### Phase 2: App Shell And Navigation

- [ ] Rebuild server rail: 72px width, `--color-bg-rail` background, circular icons, active pill indicator, using shared `Tooltip`, `IconButton`, `Avatar`.
- [ ] Rebuild server menu using Radix `DropdownMenu`.
- [ ] Rebuild channel sidebar: `--color-bg-sidebar` background, compact `--height-channel-row` rows, muted text, hover states.
- [ ] Replace create/join server modal with Radix `Dialog`.
- [ ] Replace create channel modal with Radix `Dialog`.
- [ ] Add keyboard navigation for server rail and channel rows.
- [ ] Verify desktop shell grid remains exactly: `72px / 240px / minmax(0, 1fr) / 240px`.
- [ ] Delete or prefix legacy sidebar styles after migration.
- [ ] Run minimum merge checks. Capture after screenshots and compare with before.

---

### Phase 3: Chat Surface And Member Sidebar

- [ ] Before splitting `ChatPanel.tsx`, capture before screenshots of the full chat surface.
- [ ] Split `ChatPanel.tsx` into focused components:
  - `ChatHeader`
  - `UtilityPanel`
  - `CallStage`
  - `MessageList`
  - `MessageRow`
  - `MessageActions`
  - `MessageComposer`
  - `AttachmentPreviewDialog`
- [ ] Reduce `ChatPanel.tsx` below 1000 lines.
- [ ] Chat area uses `--color-bg-chat` background with dense message rows and subtle hover toolbar matching Discord proportions.
- [ ] Replace toolbar buttons with shared `IconButton` + `Tooltip`.
- [ ] Replace message quick reactions with Radix `Popover` only if a popover is still needed; otherwise use inline Discord-style reaction buttons.
- [ ] Replace media preview overlay with Radix `Dialog`.
- [ ] Add Radix `ContextMenu` for messages with reply, edit, delete, pin, copy, and react actions.
- [ ] Rebuild member sidebar in the same phase: `--color-bg-sidebar` background, role grouping, small status indicators.
- [ ] Replace hover-only member profile card with Radix `Popover`.
- [ ] Add member context menu for manage roles and direct message entry points.
- [ ] Add `aria-live` for new message and typing updates.
- [ ] Keep message grouping, hover toolbar, timestamp behavior, and composer density close to Discord.
- [ ] Run minimum merge checks. Compare after screenshots with before for desktop and mobile.

---

### Phase 4: Home And Direct Messages

- [ ] Split `HomePanel.tsx` into focused components:
  - `FriendsList`
  - `FriendRequestList`
  - `ConversationList`
  - `DirectMessageTimeline`
  - `DirectMessageComposer`
- [ ] Rebuild Home/DM view with shared list rows, avatars, buttons, text fields, banners, and composer.
- [ ] Use consistent empty/loading/error states from Phase 1 primitives.
- [ ] Add keyboard navigation for friends and conversation rows.
- [ ] Keep direct message behavior and existing handlers unchanged.
- [ ] Run minimum merge checks. Compare after screenshots with before.

---

### Phase 5: Settings, Roles, Forms, And Preferences

- [ ] Rebuild `SettingsModal` with Radix `Dialog`.
- [ ] Reduce `SettingsModal.tsx` below 1000 lines by splitting: profile, server, channel, roles, member roles, notifications sections.
- [ ] Use Radix `Tabs` **only if it does not force a browser-tab visual style**. Prefer a Discord-like left vertical settings nav if it better matches the target UI.
- [ ] Replace raw `<select>` with Radix `Select`.
- [ ] Replace raw checkboxes and switches with Radix `Checkbox` and `Switch`.
- [ ] Replace form buttons, inputs, and textarea with shared UI primitives.
- [ ] Keep role permission grids dense and readable.
- [ ] Verify modal focus trap, escape close, overlay click behavior, and focus restore.
- [ ] Preserve all existing submit handlers and API behavior.
- [ ] Run minimum merge checks. Compare after screenshots with before.

---

### Phase 6: Performance, Visual Polish, And Cleanup

- [ ] Measure message list scroll performance with more than 500 visible messages.
- [ ] Add `react-window` only if measured performance requires virtualization.
- [ ] If virtualization is added, preserve message grouping, scroll anchoring, hover actions, and day dividers.
- [ ] Delete migrated legacy CSS and unused classes.
- [ ] Ensure no source file exceeds 1000 lines.
- [ ] Ensure long channel names, usernames, role names, and messages do not overflow.
- [ ] Ensure composer never overlaps or becomes unreachable.
- [ ] Finalize toast: bottom-right, max 3 visible, 5s auto-dismiss for notices, manual dismiss for errors.
- [ ] Verify all async actions have loading, disabled, success, and error states.
- [ ] Run full static scan. Capture final after screenshots and compare against Phase 0A before screenshots.

---

## Public Interfaces And Type Changes

- Add shared UI component prop types: `ButtonProps`, `IconButtonProps`, `TextFieldProps`, `DialogProps`, `MenuItem`, `SelectOption`, `TabsItem`, `ToastMessage`.
- Add context/hook contracts for auth, socket, theme, workspace notifications, servers, messages, and direct messages.
- No backend API changes.
- No database/schema changes.
- `AppShell.tsx` becomes orchestration only; feature behavior moves into hooks and presentation moves into components.

---

## Merge And Rollback Strategy

- Each phase lands as one PR, or at most three focused PRs when a phase is large.
- Phase 1 primitives must be reviewed and stable before Phase 2 starts.
- Old and new components may coexist temporarily, but migrated legacy styles must be deleted or isolated with a `legacy-` prefix.
- Every phase must include a migration-done checklist item confirming old implementation paths were removed or intentionally retained.
- If a phase introduces visual or behavior regressions, rollback the phase PR instead of partially reverting individual files.
- Do not begin a new phase while the previous phase has failing lint, typecheck, build, file-size, or visual smoke checks.

**Minimum required before each phase merge:**
- `npm run lint`
- `npm run typecheck`
- `npm run build --workspace apps/web`
- Manually verify: login, server list, channel list, send message, DM, and settings modal still work.
- Compare before/after screenshots for all screens touched in the phase.

Automated Playwright screenshots are added incrementally and are not required to gate the first phases.

---

## Test Plan

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build --workspace apps/web`.
- [ ] Add and run `ui:smoke` script before relying on it in CI.
- [ ] Add and run static UI scan for: forbidden colors/gradients (panels/shell only), colored glows, raw modal/menu/popover implementations, files over 1000 lines.
- [ ] **Before/after visual verification** (required, not optional):
  - Before starting each phase, capture the current state of every screen that phase will touch. Store in `docs/screenshots/before/`.
  - After completing the phase, compare desktop (1440×900, 1366×768) and mobile (390×844) screenshots. Store in `docs/screenshots/after/`.
  - List all visible differences. Flag any unintended layout shifts, spacing changes, or color deviations as regressions before merging.
- [ ] Automated Playwright screenshots added incrementally (not required to gate Phase 1–2):
  - Auth screen
  - Main server chat at 1440×900, 1366×768, 390×844
  - Settings modal
  - Server create/join dialog
  - Channel create dialog
  - Message context menu
  - Message reaction popover
  - Member popover
  - Home/DM view
- [ ] Verify accessibility:
  - Dialog focus trap and restore
  - Keyboard navigation for server rail, channels, messages, members, and settings
  - Accessible labels for icon-only controls
  - `aria-live` for realtime events
  - Reduced-motion behavior
- [ ] Static scan must confirm:
  - No forbidden neon colors.
  - No `linear-gradient` or `radial-gradient` on panels/shell (allowed only in brand/banner areas).
  - No colored glow shadows.
  - No source file over 1000 lines.
  - No raw modal/menu/popover implementation where Radix components should be used.

---

## Assumptions

- Radix UI packages are installed per phase, not all upfront.
- `clsx` is used instead of CVA.
- CSS Modules are used for component-scoped styles.
- All component styles consume design tokens — no hardcoded color or spacing values in component files.
- Native scrollbars remain the default unless a specific component cannot meet Discord-like behavior or accessibility requirements.
- The implementation is incremental and behavior-preserving.
- Custom CSS remains limited to Discord tokens, exact layout constraints, responsive behavior, and narrow component polish.
