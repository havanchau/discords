# Discord UI Redesign Plan

## Summary

This plan defines an incremental, library-first UI refactor that makes the web client feel much closer to Discord's desktop app while reducing raw CSS, oversized components, and manual accessibility work.

The implementation must use Radix UI primitives per phase, `clsx` for class composition, existing `lucide-react` icons, and scoped CSS Modules for component styling. Do **not** use CVA for this project; the variant surface is small enough for token-based CSS classes plus `clsx`.

## Non-Negotiable Rules

- Every implementation task must start with a truthful checklist.
- No source file may exceed **1000 lines** after the refactor. If a file would exceed 1000 lines, split it into focused modules before continuing.
- `AppShell.tsx`, `ChatPanel.tsx`, `SettingsModal.tsx`, `WorkspaceSidebar.tsx`, and `styles.css` must all be reduced below 1000 lines.
- Install UI dependencies per phase only when they are used in that phase.
- Keep global CSS limited to tokens, base reset, app-shell grid, and shared browser defaults.
- Use CSS Modules for component-specific styling.
- Do not add raw CSS unless it is strictly required for Discord tokens, exact layout constraints, targeted responsive fixes, or narrow component polish.
- Preserve existing backend APIs, Socket.IO behavior, permissions, uploads, calls, and E2EE behavior.

## Dependency Strategy

- Phase 0:
  - Pin existing dependency versions instead of using `"latest"`.
  - Commit or refresh `package-lock.json`.
- Phase 1:
  - Add `clsx`.
  - Add `@radix-ui/react-tooltip`, `@radix-ui/react-dialog`, `@radix-ui/react-toast`, and `@radix-ui/react-context-menu`.
- Phase 2:
  - Add `@radix-ui/react-dropdown-menu`.
- Phase 4:
  - Add `@radix-ui/react-tabs`, `@radix-ui/react-select`, `@radix-ui/react-switch`, and `@radix-ui/react-checkbox`.
- Do not add `@radix-ui/react-scroll-area` unless native scrolling cannot satisfy the Discord visual and accessibility requirements.
- Do not add `react-window` until a measured channel with more than 500 visible messages shows poor scroll performance.

## Implementation Checklist

### Phase 0: Stability, File Size, And State Foundation

- [ ] Pin all existing `package.json` and `apps/web/package.json` dependencies to exact versions.
- [ ] Commit a reproducible lockfile update.
- [ ] Add a file-size check script that fails when tracked source files exceed 1000 lines.
- [ ] Extract AppShell state and side effects into focused hooks:
  - `useAuthSession`
  - `useServers`
  - `useMessages`
  - `useDirectMessages`
  - `useRealtimeSocket`
  - keep existing `useChannelCall`
- [ ] Add lightweight React context providers for auth, socket, theme, and workspace notifications where they reduce prop drilling.
- [ ] Reduce `AppShell.tsx` below 1000 lines before starting Phase 2.
- [ ] Keep all extracted hooks behavior-compatible with current API calls and Socket.IO events.

### Phase 1: Design System Foundation

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
- [ ] Move component-specific styles into CSS Modules.
- [ ] Keep `styles.css` only for root tokens, reset/base rules, app-shell layout, and global browser defaults.
- [ ] Define motion tokens matching `DISCORD_UI_SKILL.md`: 100ms menus, 150ms server icon radius, 200ms modal, 300ms sidebar.
- [ ] Add `prefers-reduced-motion` support.
- [ ] Add focus-visible styling to every primitive.
- [ ] Reduce `styles.css` below 1000 lines.

### Phase 2: App Shell And Navigation

- [ ] Rebuild server rail using shared `Tooltip`, `IconButton`, and `Avatar`.
- [ ] Rebuild server menu using Radix `DropdownMenu`.
- [ ] Rebuild channel sidebar with shared row/list components and native scrolling.
- [ ] Replace create/join server modal with Radix `Dialog`.
- [ ] Replace create channel modal with Radix `Dialog`.
- [ ] Add keyboard navigation for server rail and channel rows.
- [ ] Verify desktop shell remains exactly: `72px / 240px / minmax(0, 1fr) / 240px`.
- [ ] Delete or prefix legacy sidebar styles after migration to avoid selector conflicts.
- [ ] Verify desktop, tablet, and mobile behavior for this phase before merging.

### Phase 3: Chat Surface And Member Sidebar

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
- [ ] Replace toolbar buttons with shared `IconButton` + `Tooltip`.
- [ ] Replace message quick reactions with Radix `Popover` only if a popover is still needed; otherwise use inline Discord-style reaction buttons.
- [ ] Replace media preview overlay with Radix `Dialog`.
- [ ] Add Radix `ContextMenu` for messages with reply, edit, delete, pin, copy, and react actions.
- [ ] Rebuild member sidebar in the same phase so the main 4-column viewport stays visually consistent.
- [ ] Replace hover-only member profile card with Radix `Popover`.
- [ ] Add member context menu for manage roles and direct message entry points.
- [ ] Add `aria-live` for new message and typing updates.
- [ ] Keep message grouping, hover toolbar, timestamp behavior, and composer density close to Discord.
- [ ] Verify desktop, tablet, and mobile behavior for this phase before merging.

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
- [ ] Verify desktop, tablet, and mobile behavior for this phase before merging.

### Phase 5: Settings, Roles, Forms, And Preferences

- [ ] Rebuild `SettingsModal` with Radix `Dialog`.
- [ ] Reduce `SettingsModal.tsx` below 1000 lines by splitting profile, server, channel, roles, member roles, and notifications sections.
- [ ] Use Radix `Tabs` or a Discord-like left settings nav for settings sections.
- [ ] Replace raw `<select>` with Radix `Select`.
- [ ] Replace raw checkboxes and switches with Radix `Checkbox` and `Switch`.
- [ ] Replace form buttons, inputs, and textarea with shared UI primitives.
- [ ] Keep role permission grids dense and readable.
- [ ] Verify modal focus trap, escape close, overlay click behavior, and focus restore.
- [ ] Preserve all existing submit handlers and API behavior.
- [ ] Verify desktop, tablet, and mobile behavior for this phase before merging.

### Phase 6: Performance, Visual Polish, And Cleanup

- [ ] Measure message list scroll performance with more than 500 visible messages.
- [ ] Add `react-window` only if measured performance requires virtualization.
- [ ] If virtualization is added, preserve message grouping, scroll anchoring, hover actions, and day dividers.
- [ ] Delete migrated legacy CSS and unused classes.
- [ ] Ensure no source file exceeds 1000 lines.
- [ ] Ensure long channel names, usernames, role names, and messages do not overflow.
- [ ] Ensure composer never overlaps or becomes unreachable.
- [ ] Finalize toast positioning: bottom-right, maximum 3 visible toasts, 5s auto-dismiss for notices, manual dismiss for errors.
- [ ] Verify all async actions have loading, disabled, success, and error states.

## Public Interfaces And Type Changes

- Add shared UI component prop types:
  - `ButtonProps`
  - `IconButtonProps`
  - `TextFieldProps`
  - `DialogProps`
  - `MenuItem`
  - `SelectOption`
  - `TabsItem`
  - `ToastMessage`
- Add context/hook contracts for auth, socket, theme, workspace notifications, servers, messages, and direct messages.
- No backend API changes.
- No database/schema changes.
- `AppShell.tsx` becomes orchestration only; feature behavior moves into hooks and presentation moves into components.

## Merge And Rollback Strategy

- Each phase should land as one PR, or at most three focused PRs when a phase is large.
- Phase 1 primitives must be reviewed and stable before Phase 2 starts.
- Old and new components may coexist temporarily, but migrated legacy styles must be deleted or isolated with a `legacy-` prefix.
- Every phase must include a migration-done checklist item confirming old implementation paths were removed or intentionally retained.
- If a phase introduces visual or behavior regressions, rollback the phase PR instead of partially reverting individual files.
- Do not begin a new phase while the previous phase has failing lint, typecheck, build, file-size, or visual smoke checks.

## Test Plan

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build --workspace apps/web`.
- [ ] Add and run a `ui:smoke` script before relying on it in CI.
- [ ] Add and run a static UI scan script for forbidden colors, gradients, colored glows, raw modal/menu/popover implementations, and files over 1000 lines.
- [ ] Capture automated Playwright or Puppeteer screenshots for:
  - Auth screen
  - Main server chat at 1440x900
  - Main server chat at 1366x768
  - Main server chat at 390x844
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
  - No `linear-gradient` or `radial-gradient` on panels/shell.
  - No colored glow shadows.
  - No source file over 1000 lines.
  - No raw modal/menu/popover implementation where Radix components should be used.

## Assumptions

- Radix UI packages are installed per phase, not all upfront.
- `clsx` is used instead of CVA.
- CSS Modules are used for component-scoped styles.
- Native scrollbars remain the default unless a specific component cannot meet Discord-like behavior or accessibility requirements.
- The implementation is incremental and behavior-preserving.
- Custom CSS remains limited to Discord tokens, exact layout constraints, responsive behavior, and narrow component polish.
