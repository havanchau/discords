# Feature Spec: Keyboard Shortcuts

A central keyboard-shortcut registry for the web client: a quick channel/server switcher, channel and unread navigation, mark-as-read, and a cheat sheet dialog listing every shortcut.

## Goal

Power users navigate the workspace without the mouse: jump to any channel or DM by typing its name, step through channels or unread channels, and mark the open channel read, all from the keyboard, without breaking typing in the composer or any other input.

Acceptance criteria:

- `Ctrl+K` / `Cmd+K` opens a quick switcher: type to filter servers, channels, and DM conversations; `Enter` opens the highlighted result; `Esc` closes it.
- `Alt+↑` / `Alt+↓` move the active channel selection to the previous/next channel in the current server's sidebar order (skipping category headers and voice channels, since only text channels are "selectable" today per `ChannelSidebar.tsx:83-95`).
- `Alt+Shift+↑` / `Alt+Shift+↓` move to the previous/next channel that has an unread badge, across the whole sidebar.
- `Esc`, when no dialog/modal is open and focus is not in an input, marks the currently open channel read (same action as opening it already triggers via `markChannelRead`, callable again for a channel that received messages while it stayed open).
- `Ctrl+/` (`Cmd+/` on macOS) opens a cheat sheet dialog listing every registered shortcut with its description.
- No shortcut fires while focus is inside the message composer, a text input, a `textarea`, or a `contenteditable` element, **except** `Esc` (which the composer/dialogs already need for their own cancel behavior) and the browser's own native shortcuts — the registry must not intercept typing.
- Every shortcut is announced to screen readers when the cheat sheet dialog opens (it is a normal focus-trapped dialog, not a silent overlay).

## Scope

- **In scope**: a single `useKeyboardShortcuts` hook/registry mounted once in `AppShell`, the quick switcher dialog, channel/unread navigation, mark-read on `Esc`, the cheat sheet dialog, i18n for every new label.
- **Out of scope**: customizable/rebindable shortcuts, a settings page to view/change bindings (the cheat sheet is read-only), shortcuts for voice call controls (mute/deafen — not requested here), mobile/touch equivalents, vim-style multi-key chords.

## Current Behavior

- No global shortcut registry exists. `grep`-ing the web client for keyboard handling finds only local, single-purpose handlers: `DirectMessageComposer.tsx:54` (`onKeyDown` on its own textarea, presumably Enter-to-send — not read in full for this doc), and `UtilityPanel.tsx:112` (`handleSearchResultKeyDown`, arrow-key navigation scoped to that panel's own search results list, `UtilityPanel.tsx:175`).
- The main channel composer (`apps/web/src/components/chat/MessageComposer.tsx`) has no `onKeyDown` handler at all — it is a native `<form>` with a submit button (`MessageComposer.tsx:205`), so Enter-to-submit is the browser's default form behavior, not custom code.
- `AppShell.tsx` (817 lines) holds `channelBadges: Record<string, ChannelBadgeState>` as local state (`AppShell.tsx:57`) and passes it down to `ChannelSidebar` (`AppShell.tsx:612`, `ChannelSidebar.tsx:67`), which is exactly the unread-badge data an unread-navigation shortcut needs to read.
- `ChannelSidebar.tsx:85-95` builds the visible channel list via `groupChannelsByCategory` (`@/utils/channelCategories`) filtered to `visibleTextChannels`/`visibleVoiceChannels` (`ChannelSidebar.tsx:60-83`); `selectChannel` (from `actions`, `ChannelSidebar.tsx:74`) is the existing function that changes the active channel — a nav shortcut calls this same function rather than duplicating channel-selection logic.
- `components/ui/Dialog.tsx` is the repo's existing generic dialog component (also used by `ServerEventsDialog.tsx`, `EditCategoryDialog.tsx`, `CreateGroupDialog.tsx`) — the cheat sheet and quick switcher should be built on it rather than a new overlay primitive.
- There is no quick-switcher, command-palette, or cheat-sheet concept anywhere in `apps/web/src` (grepped, no matches).

## Changes

### Rules

- The registry attaches exactly one `window`-level `keydown` listener (mounted once in `AppShell`, not per-component), matching to a small static table of `{ combo, handler, whenNotTyping }` entries, so a second feature adding a shortcut later extends one table instead of adding a second global listener.
- "Typing" is detected the same way for every entry that needs it: `document.activeElement` is an `<input>`, `<textarea>`, or has `contenteditable`/`role="textbox"` — checked once per keydown, not per shortcut.
- `Esc` is dispatched even while typing (composer cancel, dialog close, mark-read), but the registry gives the currently-open dialog/composer first refusal: if a dialog is open, `Esc` closes the dialog and does not also trigger mark-read in the same keystroke (mark-read only fires when `Esc` reaches the registry with no dialog open and no typing target).
- `Ctrl+K`/`Cmd+K` and `Ctrl+/`/`Cmd+/` are intercepted even while typing everywhere **except** inside the message composer and the quick switcher's own search input (so a user composing a message can still summon the switcher, but the switcher's search box does not re-trigger itself while the user types a `/` in a search query — the cheat sheet combo is scoped to avoid colliding with the slash-command autocomplete the composer already reads from `parseSlashCommand`, `slashCommands.ts:35`).
- Channel navigation (`Alt+↑/↓`, `Alt+Shift+↑/↓`) only fires when a server (not the Home/DM view) is open, and is a no-op at the first/last channel (no wraparound), matching how `UtilityPanel.tsx:112`'s existing local arrow-key handler already stops at its list boundaries rather than wrapping.
- Unread navigation only considers channels the caller can currently see in the sidebar (`visibleTextChannels`) with a non-zero `ChannelBadgeState` count — consistent with `ChannelSidebar.tsx:274`'s existing definition of "has activity" (`channelBadges[item.id]?.mentions`).
- The cheat sheet lists every entry from the shortcut table with its translated description; it has no interactive bindings, just a static list, rendered in `components/ui/Dialog.tsx`.

### Client

- New `apps/web/src/hooks/useKeyboardShortcuts.ts`: owns the single `keydown` listener, the "is typing" check, and dispatches to registered handlers; mounted once from `AppShell.tsx` (already the file holding `channelBadges` and `selectChannel`, so no prop-drilling is needed to wire navigation).
- New `apps/web/src/components/shortcuts/QuickSwitcher.tsx`: a `Dialog` containing a text input and a filtered, keyboard-navigable list of servers/channels/DM conversations (reusing the arrow-key-list pattern already proven in `UtilityPanel.tsx:112`'s `handleSearchResultKeyDown`), `Enter` calls the same `selectChannel`/`openHome`-style actions `ChannelSidebar` already uses.
- New `apps/web/src/components/shortcuts/ShortcutCheatSheet.tsx`: a `Dialog` listing the static shortcut table.
- `AppShell.tsx` renders both new dialogs alongside its existing dialog state (it already manages several, per `components/workspace/WorkspaceDialogs.tsx`'s pattern), adding `isQuickSwitcherOpen` / `isCheatSheetOpen` to its existing dialog-state shape.
- Every visible shortcut hint (composer placeholder addition, cheat sheet labels, quick switcher empty state) goes through the i18n catalog under a new `shortcuts.*` namespace, per `docs/features/i18n-localization.md:53`.

## Technical Approach

### Data model

None. This is a client-only, stateless feature — no new table, column, or migration.

### API

None. No new endpoint. Mark-read reuses the existing `markChannelRead` call the channel-open path already makes (client-side call site, not read in full for this doc — confirm the exact hook before implementation, see Open Questions) — the same server-side rule as `apps/api/src/modules/messages/messages.service.ts`'s `markChannelRead` (`readState.upsert` keyed on `userId_channelId`).

### Realtime

None. No new socket event. The shortcut acting on `channelBadges` reads client-side state that already updates from the existing `unread:updated` socket event (`apps/api/src/modules/realtime/messages.gateway.ts:215-219`); the shortcut does not itself talk to the server except through the existing mark-read call.

### Files

- Web: `hooks/useKeyboardShortcuts.ts` (new), `components/shortcuts/QuickSwitcher.tsx` (new), `ShortcutCheatSheet.tsx` (new), `Shortcuts.module.css` (new), `AppShell.tsx` (mount hook, dialog state), `components/ui/Dialog.tsx` (reused, not modified unless it lacks a needed prop — check before assuming), `i18n/locales/en.ts` / `vi.ts` (new `shortcuts.*` keys).

## Trade-offs

- **One global listener with a static table vs. each feature owning its own `keydown` handler**: the repo already has two ad hoc local handlers (`DirectMessageComposer.tsx:54`, `UtilityPanel.tsx:112`); a third global one layered on top without coordination risks two handlers reacting to the same key. A single registry owning every cross-cutting shortcut (not the composer's own Enter-to-send, which stays local since it is scoped to that one input) keeps "is this key already spoken for" answerable by reading one file. Cost: every new global shortcut must go through this one hook instead of being added locally, which is a small discipline cost worth paying once conflicts are possible.
- **`Esc` for mark-read vs. a dedicated shortcut**: `Esc` is the natural "I'm done looking at this" gesture and matches the existing `handleSearchResultKeyDown`/dialog-close convention already in the codebase, but it also means mark-read is invisible in the composer/dialog `Esc` handling code paths unless the registry deliberately checks "is anything else claiming `Esc` first." That ordering rule is spelled out above specifically because the alternative (both firing) would be a silent, hard-to-notice bug.
- **No rebinding UI**: a full customizable-shortcuts settings page is standard in mature chat apps but is a meaningfully larger feature (persisting per-user bindings, conflict detection, a settings section) than the ask here; the cheat sheet is read-only and ships first, and rebinding is a natural follow-up once the fixed set is proven useful.
- **Quick switcher scope (servers/channels/DMs) vs. also matching messages/members**: matching message content or member names would need a server-side search call per keystroke (the existing message search already exists per `MessageSearchFilters`/`messages.search.ts`, referenced in other docs), turning a client-only, instant-feel feature into a debounced network-dependent one. Scoping to already-loaded sidebar/DM data keeps it instant; a "search everything" mode is a plausible phase 2, not designed here.

## Risks & Rollback

- **Risk**: a global `keydown` listener that mis-detects "is typing" could swallow a keystroke meant for some other input (e.g., a `Select` component that also listens for arrow keys) — every new input surface added to the app must be checked against the shared "is typing" predicate, not just text inputs, or a future component could silently lose arrow-key handling to this registry.
- **Risk**: `Ctrl+K` and `Ctrl+/` may collide with the browser's own bindings (`Ctrl+K` focuses the address bar in some browsers when not intercepted early enough, some browsers reserve `Ctrl+/`) — `event.preventDefault()` must run before the browser acts on it; verified per-browser during manual testing, not assumed from the code.
- **Risk**: screen-reader users navigating by keyboard could have expected browser/OS shortcuts overridden unexpectedly; scoping strictly to the documented combos (not single letters, which some apps use and which conflicts with typing "j"/"k" style navigation) avoids the worst of this, but manual testing with a screen reader is recommended before shipping (not performed for this doc).
- **Rollback**: revert the code. No migration, no data, nothing to roll back beyond the diff.

## Test Plan

Not covered by automated tests per `RULE.md:77`. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`.

- **Manual**: while focus is in the message composer, type a sentence containing `/` and letters that match shortcut combos when modified (e.g., type normally) → no shortcut fires, text appears normally in the composer.
- **Manual**: `Ctrl+K` (or `Cmd+K`) from anywhere except the composer/switcher input → quick switcher opens; type a channel name → filtered list narrows; `Enter` → that channel opens and the switcher closes; `Esc` → switcher closes without navigating.
- **Manual**: with a server open and its sidebar showing at least 3 text channels, `Alt+↓` repeatedly → active channel advances through the sidebar order and stops (does not wrap) at the last channel; `Alt+↑` reverses.
- **Manual**: with at least one channel showing an unread badge, `Alt+Shift+↓` → jumps directly to that channel even if it is not adjacent to the current one.
- **Manual**: open a channel, have another client post a message into it, then press `Esc` with focus outside any input → the badge for that channel clears the same way it would if the channel were reopened.
- **Failure case**: `Ctrl+/` while a dialog (e.g., Server settings) is already open → the existing dialog's own `Esc`/close behavior is not affected, and the cheat sheet either stacks correctly on top or is suppressed — whichever the implementation picks, it must not silently do nothing (an unhandled combo while a dialog is open is the concrete case to verify manually).

## Deployment Notes

- No env var, no migration, no backend deploy required — this ships as a web-only release.
- New i18n keys ship in both `en` and `vi` in the same change, per `docs/features/i18n-localization.md:11`, and must pass `npm run i18n:check`.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code. No automated tests (per `RULE.md`); `typecheck`, `lint`, `build`, `check:file-size`, `i18n:check`, `ui:scan`, `docs:check` and Prettier pass, and no manual or browser scenario from the test plan has run.

- **Code placement.** The table and the focus guards live in `apps/web/src/utils/keyboardShortcuts.ts` (`SHORTCUTS`, `matchesShortcut`, `isTypingTarget`, `hasForeignOverlay`, `shortcutKeycaps`), the single `window` listener in `hooks/useKeyboardShortcuts.ts`, sidebar order and stepping in `utils/shortcutNavigation.ts`, and the handlers plus dialog state in `components/shortcuts/KeyboardShortcuts.tsx`, which `AppShell.tsx` mounts once inside `WorkspaceProvider` (one element, no dialog state added to `AppShell`, which is near the file-size limit). Switcher data is built in `components/shortcuts/quickSwitcherEntries.ts`. `components/ui/Dialog.tsx` is unchanged. Copy is in a new `i18n/locales/{en,vi}/shortcuts.ts` module, because the catalogs were split per area after this spec was written.
- **`Cmd/Ctrl+K` and `Cmd/Ctrl+/` fire from every text field, including the composer.** The rule above excluded the composer, but its own reason is that a user composing a message can summon the switcher; neither combo produces text, and slash-command autocomplete reacts to a typed `/`, not to `Ctrl+/`. Both combos toggle: pressing `Cmd/Ctrl+K` in the switcher's search field closes it, and each combo closes the other shortcut dialog before opening its own. Auto-repeat of either combo is ignored.
- **Other dialogs.** A dialog, popover or menu counts as open when an element with `role="dialog"`, `role="alertdialog"` or `role="menu"` is in the DOM without `data-state="closed"`; the two shortcut dialogs are excluded by a `data-shortcut-dialog` attribute. While one is open, `Cmd/Ctrl+K`, `Alt+↑/↓`, `Alt+Shift+↑/↓` and `Esc` mark-read do nothing, and the browser default of `Cmd/Ctrl+K` is still suppressed. `Cmd/Ctrl+/` opens the cheat sheet on top of the dialog (Radix stacks them; `Esc` closes the top one first). This covers every Radix dialog in the app, including Settings (and the AutoMod rule form inside it), Discovery, Report server, Forward, Report message, Scheduled messages, Saved messages, New forum post, Server events, Create group and the incoming call dialog.
- **Keys claimed by a closer handler are left alone.** The listener ignores a keydown whose `defaultPrevented` is already set: Radix sets it when `Esc` closes a dialog, popover or menu, so the same `Esc` never also marks read, and local handlers that already handle arrow keys (`handleListKeyboardNavigation`, `UtilityPanel`'s search results, the quick switcher's own list) keep them. Keydowns during IME composition are ignored. `isTypingTarget` also counts `<select>`, text-like `<input>` types only (not checkboxes or buttons), and `role="combobox"`/`role="searchbox"`.
- **Home view.** On Home, `Alt+↑/↓` steps through the Home conversation list (direct and group conversations, in `ConversationList` order and with the same hidden-partner filter), `Alt+Shift+↑/↓` steps through those with `unreadCount > 0`, and `Esc` marks the open conversation read with `markDirectConversationRead`. The spec limited navigation and mark-read to servers.
- **Mark-read sends no message id.** `Esc` calls `markChannelRead(channelId)` without a message id, so the API reads up to the latest message (`apps/api/src/modules/messages/messages.service.ts:111-121`) rather than the last one the client holds. It does nothing while the server is behind rules screening (`server.needsOnboarding`), where the API refuses reads.
- **Quick switcher scope.** Results are: channels of the open server, conversations, channels of every other joined server, then servers. Channel lists come from the server list and detail the client already holds, both filtered by view permission in the API (`apps/api/src/modules/servers/servers.service.ts:57-72` and `:104`). Voice channels are left out (no select action in the sidebar); forum channels are listed with a "Forum in {server}" label. Picking a channel in another server opens that server and keeps the chosen channel. A server behind rules screening still shows `RulesGate`. Matching is a case-insensitive substring with prefix matches first, capped at 50 rendered results. The search field is an ARIA combobox over a listbox (`aria-activedescendant`), with a polite live region announcing the result count.
- **Channel navigation order.** Steps follow the sidebar's own filtered list (`visibleTextChannels`, so the sidebar search narrows it) grouped by `groupChannelsByCategory`: uncategorized text and forum channels, then each category. Channels in a collapsed category are still reachable. A channel counts as unread when its badge has a non-zero `count` or `mentions`. With no channel or conversation open, a step down goes to the first item and a step up to the last.
- **Cheat sheet.** Keycaps show `⌘`, `⌥`, `⇧` on macOS (detected from `navigator.userAgent`) and `Ctrl`, `Alt`, `Shift` elsewhere; the glyphs are hidden from screen readers and each row carries the spoken key names from the catalog instead. No shortcut hint was added to the composer placeholder.
