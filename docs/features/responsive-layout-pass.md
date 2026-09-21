# Feature Spec: Responsive Layout Pass

Fixes the layouts that break on tablet and phone widths: a crashing mobile drawer, a mis-laid-out message composer, a clipped message toolbar, and a Home screen that is unusable below desktop width.

- **Status**: implemented 2026-09-21 (user delegated the open decisions)
- **Date**: 2026-09-21
- **Related**: [`../design-rules.md`](../design-rules.md) (Layout), [`ui-consistency-pass.md`](ui-consistency-pass.md)

## Goal

Checked with headless Chrome at 375, 768, 1024 and 1280 px (demo account). The web client is built for desktop; below ~1100 px several surfaces break, and on a phone the Home screen offers no way to reach friends or DMs.

Acceptance criteria:

- [x] Opening the mobile menu (≤ 720 px) shows the drawer instead of blanking the app.
- [x] The composer input takes the remaining width at every viewport, and the control group reads as one bar.
- [x] The message hover toolbar is never clipped by the chat column.
- [x] On a phone (≤ 720 px) the server rail no longer takes a permanent column; it is reached through the drawer.
- [x] On Home, at ≤ 1100 px, the friends/DM list and an open conversation never share the width; the conversation view has a way back to the list.
- [x] On Home, at ≤ 1100 px, the friends/DM list is reachable and a menu button opens the drawer (server rail, user panel).
- [x] Below 1100 px a header button in a server channel opens the member list.
- [x] No horizontal page scroll at 375 / 768 / 1024 / 1280 px on the channel, Home, and settings screens.

## Scope

**In scope**

- Part 1 (bug fixes, done): drawer crash, composer layout, message toolbar clipping.
- Part 2 (layout change): server rail on phones, Home master/detail below desktop width, member list drawer below 1100 px.

**Out of scope**

- The empty `ChannelSidebar` column on Home at desktop width (see Current behavior) — a desktop design question, not a responsive one.
- Voice/stage call layouts, forum, and settings sub-pages beyond the profile dialog (the profile dialog renders correctly at 375 px).

## Current behavior

- Shell grid: `auto 240px 1fr 240px`, dropping the member column at 1100 px and the channel column at 720 px — `apps/web/src/components/app/AppLayout.module.css:6-30`.
- `MobileNavDrawer` was rendered by `AppShell` outside `AuthenticatedWorkspace`, i.e. outside `AuthProvider`; the channel sidebar inside it calls `useAuthContext`, so opening it threw `useAuthContext must be used inside AuthProvider` and unmounted the app (reproduced at 375 px).
- The composer was a grid with a fixed 7-column template (`auto ×4, 1fr, auto ×2`). There are 7 controls plus the input (attach, voice, emoji, sticker, schedule, input, send) once `ScheduleSendButton` is shown, so the schedule button landed in the `1fr` column and the input in an `auto` column — a gap in the bar and a clipped input at every width, including 1280 px.
- The message action toolbar (12 buttons, ~465 px) only wrapped at viewport ≤ 720 px (`MessageRow.module.css`). At 768 px the chat column is ~450 px, so the toolbar overflowed left and the Reply/Thread buttons were clipped by `.messageList { overflow-x: hidden }`.
- Server rail is always visible (`ServerRail.module.css`); at 375 px it takes 76 px of 375, the channel name in the header truncates to one letter.
- Home: `HomePanel` is a grid `minmax(280px, 320px) 1fr` spanning `grid-column: 3 / -1` — `home/HomePanel.module.css:2-6`. In Home mode `ChannelSidebar` still occupies the 240 px column with only its header and user panel. At 768 px that leaves ~130 px for the conversation.
- Home at ≤ 720 px hides `HomeSidebar` (`home/HomePanel.module.css:341-348`) and `ChannelSidebar` hides itself (`workspace/ChannelSidebar.module.css:263-266`). Home has no menu button, so friends, friend requests and recent DMs are unreachable on a phone.

## Changes

### Part 1 — implemented

1. `MobileNavDrawer` moved into `AuthenticatedWorkspace`, inside the providers; `AppShell` passes `mobileNav={{ open, onOpenChange }}`. The drawer's own `TooltipProvider` is removed (the outer one now covers it).
2. Composer is a wrapping flex row. Banner rows (scheduled bar, reply, command suggestions, interaction status, pending attachments) take a full line; controls are `flex: none`; the input's field shell takes the slack. Emoji, sticker and the mobile "More" button use a new `segmentButton` class (square, top/bottom border) instead of `attachButton` (rounded left edge), so the bar reads as one control group.
3. `MessageList` declares `container: message-list / inline-size`; the toolbar wrap rule moved from `@media (max-width: 720px)` to `@container message-list (max-width: 560px)`, so it follows the chat column width.

### Part 2 — approved

1. **Server rail on phones.** At ≤ 720 px `ServerRail` hides itself in the shell (the drawer keeps showing it, the same way it forces `ChannelSidebar` back on). The shell collapses to one column at that width.
2. **Home master/detail at ≤ 1100 px.**
   - `ChannelSidebar` in Home mode hides itself at ≤ 1100 px; `HomePanel` then spans columns 2 to end.
   - `HomePanel` shows one pane: the friends/DM list when no conversation is open, the conversation when one is.
   - The conversation header gets a back button (visible at ≤ 1100 px only) that closes the active conversation and returns to the list.
   - Closing sets the active conversation to `null` and clears its messages and reply target, the same reset `removeDirectConversation` does (`hooks/useDirectMessages.ts:91-98`).
   - A conversation removed while open already resets to `null`, so the list pane shows again.
3. **Home menu at ≤ 1100 px.** `HomeSidebar`'s header gets a menu button (visible at ≤ 1100 px only) that opens the same drawer as `ChatHeader`'s. On tablets this is how the user panel (profile, sign-out) stays reachable once the Home-mode `ChannelSidebar` column hides. Decision (was open question 2): reuse the drawer rather than move the user panel into `HomeSidebar`, so there is one user panel component and one mobile navigation surface.
4. **Member list drawer below 1100 px.** `ChatHeader` gets a Members button (visible at ≤ 1100 px only) that opens `MemberSidebar` in a right-anchored drawer built on the shared `Dialog`, mirroring `MobileNavDrawer`. Decision (was open question 1): a drawer, not an in-panel overlay like the thread panel, because the Dialog already provides focus trap, Esc and scrim, and the member list has no state that must survive closing.
5. `openMobileNav` and `openMemberList` go on `WorkspaceContext` (next to `openSavedMessages`, `contexts/WorkspaceContext.tsx:26`), so Home and the chat header reach them without threading props through `buildWorkspaceShellProps`.

### Edge cases

| Case                                              | Expected behavior                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Encrypted channel (no schedule button)            | Composer still lays out correctly — the flex row does not depend on the count. |
| Resize from phone to desktop with drawer open     | Drawer stays open until dismissed; the layout underneath switches normally.    |
| Conversation opened from a notification on mobile | Detail pane shows; back returns to the list.                                   |
| Incoming call while on the list pane              | Unchanged — the incoming-call dialog is a portal, independent of the panes.    |

## Technical approach

| File                                                                                                   | Change                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `AppShell.tsx`, `app/AuthenticatedWorkspace.tsx`                                                       | Part 1: drawer placement, `mobileNav` prop.                                                              |
| `workspace/MobileNavDrawer.tsx`                                                                        | Part 1: drop nested `TooltipProvider`. Part 2: force the rail back on inside the drawer (`.module.css`). |
| `chat/MessageComposer.tsx`, `.module.css`                                                              | Part 1: flex layout, `segmentButton`, `composerField`.                                                   |
| `chat/MessageList.module.css`, `chat/MessageRow.module.css`                                            | Part 1: container query.                                                                                 |
| `workspace/ServerRail.module.css`, `app/AppLayout.module.css`                                          | Part 2: hide rail ≤ 720 px, single-column shell.                                                         |
| `workspace/ChannelSidebar.module.css`                                                                  | Part 2: hide in Home mode ≤ 1100 px (needs a Home-mode class).                                           |
| `HomePanel.tsx`, `home/HomePanel.module.css`, `home/HomeSidebar.tsx`, `home/HomeDirectMessageView.tsx` | Part 2: pane switching, back button, menu button.                                                        |
| `contexts/WorkspaceContext.tsx`, `AppShell.tsx`                                                        | Part 2: `openMobileNav`, `openMemberList`, member drawer state.                                          |
| `MemberListDrawer.tsx` (new), `.module.css`, `chat/ChatHeader.tsx`, `.module.css`                      | Part 2: member drawer and its header button.                                                             |
| `hooks/useDirectMessages.ts`, `hooks/useHomeWorkspace.ts`, `home/types.ts`                             | Part 2: `closeDirectConversation` action.                                                                |
| `i18n/locales/*`                                                                                       | Part 2: back, menu and members labels in every locale.                                                   |

No API, schema, or permission change.

## Trade-offs

- **Flex vs a grid template per variant (composer).** A template per case (encrypted, narrow, recording) would keep the grid but breaks again the next time a control is added; `design-rules.md` already names fixed grid templates over conditional children as an anti-pattern. Flex costs nothing and removes the class of bug.
- **Container query vs a wider media query (toolbar).** A viewport breakpoint cannot know how wide the chat column is — that depends on which sidebars are showing. A container query is exact; it is the first one in the codebase, and is supported by every browser the client already targets.
- **Master/detail vs shrinking the Home sidebar.** Even at 280 px the list leaves ~170 px for a conversation at 768 px. Showing one pane at a time is how Discord's own mobile client works and needs only a back button.
- **Hiding the rail on phones vs keeping it.** The drawer already contains the rail, so the permanent one is a duplicate that costs 20% of a 375 px screen.

## Risks & rollback

- Part 2 changes which pane is visible on Home below desktop width; a missed state (e.g. a conversation deleted while open) could leave the detail pane empty — it must fall back to the list.
- On tablets the server rail shows both in the shell and inside the drawer opened from Home — a duplicate, accepted to keep one drawer.
- Rollback: revert the commits; there is no data or API involved.

## Test plan

The repo has no automated UI tests for layout. Manual scenario, headless Chrome or devtools at 375, 768, 1024, 1280 px, demo account:

1. Channel `#general`: no horizontal scroll; composer shows attach · (voice · emoji · sticker · schedule | more) · input · send as one bar; the input is the widest element.
2. Hover a message at 768 px: the toolbar wraps inside the message, Reply and Thread visible.
3. At 375 px tap the menu button: drawer opens with rail and channels; picking a channel closes it.
4. At 375 px the server rail is not a column; it shows inside the drawer.
5. Home at 375, 768 and 1024 px: list pane shows; open a DM → conversation pane; back → list; the menu button opens the drawer with the user panel. At 1280 px Home is unchanged (list and conversation side by side, no back or menu button).
6. Server channel at 375, 768 and 1024 px: the Members button opens the member drawer; Esc closes it. At 1280 px there is no Members button and the member column shows.
7. Failure case: at 375 px open an encrypted channel — composer has no schedule button and still lays out correctly.

Checks: `npm run typecheck`, `eslint` on changed files, `npm run ui:scan`, `npm run i18n:check`, `npm run check:file-size`, `npm run docs:check`, `prettier --check`.

Run on 2026-09-21: steps 1–6 in headless Chrome (screenshots reviewed, no horizontal overflow detected); step 7 not run — no encrypted channel in the demo data.
