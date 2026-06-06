# Discord Clone UI Design Rules

> Product UI reference for Codex and contributors. These rules keep the web client aligned with the app architecture in `docs/architecture.md` and the current React component split under `apps/web/src`.

---

## 1. Recommended Codex Skill

> **MANDATORY**: Read `DISCORD_UI_SKILL.md` at the project root BEFORE starting any UI work. That file contains the enforced color tokens, layout rules, and anti-patterns.

Use the **`ui-polish`** skill when asking Codex to make the interface look better.

Before implementing UI work, create a checklist and keep it truthful: unfinished tasks stay unchecked, and completed tasks are checked only after verification.

This skill is the right fit for:

- Auditing screenshots and visible layout issues.
- Improving spacing, hierarchy, density, empty states, loading states, and responsive behavior.
- Keeping the UI consistent with the existing app shell instead of producing a generic landing-page look.
- Verifying desktop and mobile views with browser screenshots after meaningful frontend changes.
- **Fixing any neon/cyberpunk/gradient styling that does not match Discord's warm dark palette.**

For Discord-like UI work, pair `ui-polish` with the rules in `DISCORD_UI_SKILL.md` and this file.

Prefer established React UI, accessibility, icon, motion, and utility libraries over raw CSS. Custom CSS should be minimal, token-based, and used only when needed for Discord-specific layout, surfaces, or responsive polish.

---

## 2. Product Direction

The goal is not to create a decorative "AI-looking" interface. The goal is a dense, real product UI that feels like a Discord-class chat application.

Core principles:

- **Dark-first**: dark theme is the default experience. Light theme is optional.
- **Warm dark surfaces**: use Discord-like warm grays instead of pure black for normal panels.
- **Layered depth by color**: separate app regions with background layers, not heavy shadows or borders.
- **Utility before decoration**: every visible element should support navigation, communication, moderation, calling, settings, or feedback.
- **Dense but scannable**: reduce wasted space while preserving clear grouping and readable rows.
- **Real app shell**: the first screen should be the usable chat experience, not a marketing page.

Avoid:

- Oversized hero sections inside the app.
- Fake analytics cards, decorative KPI widgets, or empty marketing blocks.
- Glassmorphism, neumorphism, excessive gradients, and single-hue palettes.
- Large blank spaces where Discord would show channels, members, messages, presence, or controls.

---

## 3. Architecture Mapping

The UI should follow the same layered model as the system architecture: client shell, realtime interaction, service-backed data, and user-facing state.

| Architecture Area        | UI Surface                      | Primary Code Area                                           | Design Responsibility                                                                                |
| ------------------------ | ------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Client Layer             | App shell                       | `apps/web/src/AppShell.tsx`                                 | Compose the rail, channels, chat, members, modals, and responsive layout.                            |
| Workspace Navigation     | Server rail and channel sidebar | `components/WorkspaceSidebar.tsx`                           | Show servers, channels, voice occupancy, unread badges, active states, and channel actions.          |
| Realtime Messaging       | Chat timeline and composer      | `components/ChatPanel.tsx`                                  | Show messages, typing, replies, reactions, attachments, pins, voice messages, and realtime feedback. |
| Presence and Members     | Member sidebar                  | `components/MemberSidebar.tsx`                              | Show online state, profile affordances, role chips, and member context.                              |
| Calls and Media          | Voice/video surfaces            | `hooks/useChannelCall.ts`, `components/RemoteVideoTile.tsx` | Keep call controls stable, compact, and visually clear.                                              |
| Settings and Account     | Modals and profile controls     | `components/SettingsModal.tsx`                              | Use focused modal flows with clear save, pending, success, and error states.                         |
| API and Realtime Gateway | Async UI states                 | `apps/web/src/api.ts`, Socket.IO usage                      | Reflect loading, pending, optimistic update, retry, and error states.                                |

---

## 4. App Shell Layout

Desktop layout uses four persistent regions:

```text
+-------------+------------------+--------------------------+----------------+
| Server Rail | Channel Sidebar  | Chat Area                | Member Sidebar |
| 72px        | 240px            | flex: 1, min 460px       | 240px          |
+-------------+------------------+--------------------------+----------------+
```

| Region          |     Width | Background | Notes                                                         |
| --------------- | --------: | ---------- | ------------------------------------------------------------- |
| Server rail     |    `72px` | `#1E1F22`  | Icon-only navigation with active indicators and tooltips.     |
| Channel sidebar |   `240px` | `#2B2D31`  | Server header, channel groups, voice occupancy, unread state. |
| Chat area       | `flex: 1` | `#313338`  | Header, message timeline, composer, call banner, overlays.    |
| Member sidebar  |   `240px` | `#2B2D31`  | Presence groups and member profile affordances.               |

Fixed heights:

| Element                 | Height |
| ----------------------- | -----: |
| Top channel header      | `48px` |
| Channel row             | `34px` |
| Member row              | `42px` |
| Composer minimum height | `44px` |
| Hover message toolbar   | `32px` |

Responsive behavior:

- On tablet widths, hide or collapse the member sidebar first.
- On mobile widths, use a single primary content column and reveal navigation through explicit controls.
- Never let fixed sidebars compress the chat timeline below readable message width.
- Text in buttons, chips, and rows must wrap or truncate cleanly without overlapping icons.

---

## 5. Color System

### 5.1 Core Brand Colors

| Token   | Hex       | Usage                                           |
| ------- | --------- | ----------------------------------------------- |
| Blurple | `#5865F2` | Primary actions, selected state, brand accents. |
| Green   | `#57F287` | Success, online state, connected voice.         |
| Yellow  | `#FEE75C` | Warning and idle state.                         |
| Red     | `#ED4245` | Error, danger, delete, do-not-disturb.          |
| Fuchsia | `#EB459E` | Special badges or rare accents.                 |
| White   | `#FFFFFF` | Text on strong colored backgrounds.             |

### 5.2 Dark Theme Layers

```css
:root {
  --background-floating: #111214;
  --background-tertiary: #1e1f22;
  --background-secondary-alt: #232428;
  --background-secondary: #2b2d31;
  --background-primary: #313338;
  --background-accent: #4e5058;

  --text-normal: #dbdee1;
  --text-muted: #80848e;
  --text-link: #00a8fc;
  --header-primary: #f2f3f5;
  --header-secondary: #b5bac1;

  --interactive-normal: #b5bac1;
  --interactive-hover: #dbdee1;
  --interactive-active: #ffffff;
  --interactive-muted: #4e5058;

  --brand-color: #5865f2;
  --brand-hover: #4752c4;
  --brand-active: #3c45a5;

  --status-online: #23a55a;
  --status-idle: #f0b232;
  --status-dnd: #f23f43;
  --status-offline: #80848e;

  --background-modifier-hover: rgba(79, 84, 92, 0.16);
  --background-modifier-active: rgba(79, 84, 92, 0.24);
  --background-modifier-selected: rgba(79, 84, 92, 0.32);
  --background-message-hover: rgba(2, 2, 2, 0.06);

  --input-background: #1e1f22;
  --input-placeholder: #87898c;
  --mention-foreground: #c9cdfb;
  --mention-background: rgba(88, 101, 242, 0.3);
}
```

Theme variants may adjust surface values, but must preserve contrast, readable text, and clear region separation.

---

## 6. Typography

Preferred font stack:

```css
font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

Monospace stack:

```css
font-family: 'gg mono', 'Consolas', 'Andale Mono WT', 'Andale Mono', 'Lucida Console', monospace;
```

Type scale:

| Role         |   Size | Weight | Line Height | Usage                                             |
| ------------ | -----: | -----: | ----------: | ------------------------------------------------- |
| `display-lg` | `24px` |    700 |      `1.25` | Modal titles and major settings headings.         |
| `display-md` | `20px` |    600 |       `1.3` | Panel titles.                                     |
| `display-sm` | `16px` |    600 |     `1.375` | Channel names, card titles, important row labels. |
| `text-lg`    | `16px` |    400 |     `1.375` | Chat messages in cozy mode.                       |
| `text-md`    | `14px` |    400 |     `1.357` | UI labels, menus, tooltips.                       |
| `text-sm`    | `12px` |    400 |     `1.333` | Timestamps, metadata, category labels.            |
| `text-xs`    | `10px` |    600 |       `1.3` | Badges and tiny status labels.                    |
| `code`       | `14px` |    400 |     `1.375` | Inline code and code blocks.                      |

Rules:

- Usernames use `font-weight: 500` and either role color or `--header-primary`.
- Channel categories use uppercase `11px`, `font-weight: 600`, and slight positive letter spacing.
- Message timestamps use muted color and should not dominate the timeline.
- Do not scale font size with viewport width.
- Keep letter spacing at `0` except tiny uppercase category labels.

---

## 7. Spacing and Radius

Spacing uses a base-4 scale:

```text
4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px
```

Common spacing:

| Element                    | Spacing             |
| -------------------------- | ------------------- |
| Channel row padding        | `0 8px`             |
| Message padding            | `2px 16px 2px 72px` |
| First message in group     | `16px 16px 0 72px`  |
| Chat composer outer margin | `0 16px 24px`       |
| Sidebar top padding        | `8px`               |
| Server icon margin         | `4px auto`          |
| Modal body padding         | `16px 20px`         |
| Tooltip padding            | `8px 12px`          |

Radius tokens:

```css
--radius-xs: 2px;
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 50%;
--radius-round: 9999px;
```

Component radius:

| Component                   |         Radius |
| --------------------------- | -------------: |
| Channel row                 |          `4px` |
| Button                      | `3px` to `4px` |
| Input and composer          |          `8px` |
| Avatar                      |          `50%` |
| Server icon idle            |         `16px` |
| Server icon hover or active |          `50%` |
| Context menu                |          `4px` |
| Modal                       |          `8px` |
| Attachment preview          |          `4px` |

---

## 8. Component Rules

### 8.1 Buttons

Buttons must be visually stable and action-specific.

```css
.btn-primary {
  background: #5865f2;
  color: #ffffff;
  border: 0;
  border-radius: 3px;
  min-height: 38px;
  padding: 2px 16px;
  font-size: 14px;
  font-weight: 500;
}

.btn-primary:hover {
  background: #4752c4;
}
.btn-primary:active {
  background: #3c45a5;
}

.btn-danger {
  background: #da373c;
  color: #ffffff;
}

.btn-ghost {
  background: transparent;
  color: #dbdee1;
}

.btn-ghost:hover {
  background: rgba(79, 84, 92, 0.16);
  color: #ffffff;
}
```

Use icon buttons for obvious toolbar actions such as pin, search, call, upload, settings, close, mute, and more options. Every icon button needs a `title` or accessible label.

### 8.2 Inputs and Composer

```css
.input {
  background: #1e1f22;
  border: 0;
  border-radius: 4px;
  color: #dbdee1;
  min-height: 40px;
  padding: 10px;
  outline: none;
}

.input::placeholder {
  color: #87898c;
}

.chat-input {
  background: #383a40;
  border-radius: 8px;
  min-height: 44px;
  display: flex;
  align-items: center;
}
```

Composer rules:

- Keep upload, emoji, voice, and send controls visually anchored.
- Show disabled, pending, and error states when API or upload actions are unavailable.
- Preserve message text when upload or send fails.
- Keep the composer reachable on mobile without covering the latest message.

### 8.3 Channel Rows

```css
.channel-item {
  display: flex;
  align-items: center;
  height: 34px;
  margin: 1px 8px;
  padding: 0 8px;
  border-radius: 4px;
  gap: 6px;
  color: #80848e;
}

.channel-item:hover {
  background: rgba(79, 84, 92, 0.16);
  color: #dbdee1;
}

.channel-item.active {
  background: rgba(79, 84, 92, 0.32);
  color: #f2f3f5;
}
```

Channel rows should support:

- Active state.
- Unread state.
- Mention badge.
- Private or locked channel marker.
- Voice occupancy for voice channels.
- Inline actions without shifting row height.

### 8.4 Messages

```css
.message {
  position: relative;
  min-height: 22px;
  padding: 2px 16px 2px 72px;
}

.message.first-in-group {
  margin-top: 17px;
  padding-top: 2px;
}

.message:hover {
  background: rgba(2, 2, 2, 0.06);
}
```

Message rows should support:

- Grouping by author and time proximity.
- Reply previews.
- Reactions.
- Edited and deleted states.
- Pinned state.
- Attachment previews.
- Link previews.
- Voice message cards.
- E2EE ciphertext fallback states when content cannot be decrypted.

### 8.5 Members and Presence

Member rows should be compact, stable, and grouped by presence or role.

Required states:

- Online, idle, do-not-disturb, offline.
- Hover profile card.
- Role chips in profile surfaces.
- Current user distinction when relevant.
- Loading skeleton for member list hydration.

### 8.6 Modals and Menus

Use modals for focused account, server, channel, role, invite, and settings flows.

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #313338;
  border-radius: 8px;
  max-width: 560px;
  width: min(100%, 560px);
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.54);
}
```

Menus should use the floating background, compact rows, separators, and red danger styling only for destructive actions.

---

## 9. Interaction, Motion, and Feedback

Motion should be short and functional:

| Action                        | Duration |
| ----------------------------- | -------: |
| Hover color or opacity        |  `100ms` |
| Server icon radius transition |  `150ms` |
| Context menu appear           |  `100ms` |
| Modal fade and scale          |  `200ms` |
| Sidebar expand or collapse    |  `300ms` |
| Toast slide                   |  `250ms` |

Rules:

- Keep hover transitions below `200ms`.
- Do not animate large layout changes during typing, scrolling, or message streaming.
- Use subtle fade and scale for modal entry.
- Use local UI updates after successful CRUD responses.
- Show pending states for saves, uploads, reactions, pins, and call actions.
- Show recoverable error messages near the failed control.

---

## 10. Accessibility

```css
:focus-visible {
  outline: 2px solid #5865f2;
  outline-offset: 2px;
}

:focus:not(:focus-visible) {
  outline: none;
}
```

Requirements:

- Normal text contrast should meet WCAG AA where practical.
- Interactive targets should be at least `32px` by `32px`.
- Icon-only controls need accessible labels.
- Keyboard focus must be visible in sidebars, message actions, menus, modals, and settings.
- Dialogs should trap focus while open and restore focus when closed.
- Loading states should not cause large layout jumps.

---

## 11. Z-Index Scale

```css
--z-message-toolbar: 1;
--z-sidebar: 10;
--z-header: 20;
--z-dropdown: 100;
--z-tooltip: 200;
--z-context-menu: 300;
--z-popout: 400;
--z-modal: 500;
--z-notification: 600;
--z-overlay: 1000;
```

Do not invent one-off z-index values unless a new layer is added to this scale.

---

## 12. Markdown Rendering

The chat renderer should support the expected Discord-style subset:

| Syntax                   | Rendering                                       |
| ------------------------ | ----------------------------------------------- | ------- | --- | --- | ------------------------------ |
| `**bold**`               | `font-weight: 700`                              |
| `*italic*` or `_italic_` | `font-style: italic`                            |
| `__underline__`          | `text-decoration: underline`                    |
| `~~strikethrough~~`      | `text-decoration: line-through`                 |
| `` `code` ``             | Inline code with mono font and dark background. |
| Code block               | Full-width block code with dark background.     |
| `> quote`                | Left accent border and padded quote content.    |
| `[text](url)`            | Link color `#00A8FC`.                           |
| `                        |                                                 | spoiler |     | `   | Hidden content until revealed. |

---

## 13. Anti-Patterns

| Do Not                                         | Use Instead                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Pure black `#000000` for normal backgrounds.   | Warm dark surfaces such as `#1E1F22`, `#2B2D31`, and `#313338`.              |
| Heavy borders between all panels.              | Background layering and occasional subtle dividers.                          |
| Decorative cards inside other cards.           | Flat app regions and cards only for repeated items, modals, or framed tools. |
| Old Discord blurple `#7289DA`.                 | Current blurple `#5865F2`.                                                   |
| Hero-scale headings inside compact app panels. | Smaller dense headings matched to the surface.                               |
| Animation on every layout change.              | Short transitions for hover, modal, menu, and toast states.                  |
| Text-only toolbar buttons for obvious icons.   | Icon buttons with accessible labels.                                         |
| Fake dashboard or marketing blocks.            | Real channels, messages, members, calls, settings, and feedback.             |

---

## 14. Implementation Checklist

### Completed Documentation Tasks

- [x] Selected **`ui-polish`** as the recommended Codex skill for beautiful UI work.
- [x] Converted this design-rules document to English.
- [x] Reworked the Markdown structure to align with the repo architecture and component layout.
- [x] Added architecture-to-UI mapping for the current React/NestJS monorepo.
- [x] Added completed and pending checklist sections.

### Pending UI Implementation Tasks

- [ ] Audit the current web UI with desktop and mobile screenshots.
- [ ] Verify the four-region app shell: server rail, channel sidebar, chat area, and member sidebar.
- [ ] Check that the active channel, unread channel, mention badge, and voice occupancy states are visually distinct.
- [ ] Verify chat timeline states: loading skeleton, empty channel, grouped messages, hover actions, replies, reactions, pins, edits, deletes, and attachments.
- [ ] Verify composer states: empty, typing, upload pending, upload error, send pending, disabled, and E2EE locked or unavailable.
- [ ] Verify member sidebar states: loading, online, idle, do-not-disturb, offline, hover card, and role chips.
- [ ] Verify modal flows for settings, server actions, channel actions, invites, and role management.
- [ ] Confirm all icon-only buttons have accessible labels or titles.
- [ ] Confirm keyboard focus is visible and modal focus behavior is correct.
- [ ] Run lint, typecheck, build, and UI smoke checks after visual changes.

### Pre-Ship Visual Checklist

- [ ] Background layers match the shell hierarchy.
- [ ] Primary actions use `#5865F2`.
- [ ] Text contrast is readable on all theme surfaces.
- [ ] Font stack starts with `gg sans` and has safe fallbacks.
- [ ] Server icons use squircle-to-circle hover or active transitions.
- [ ] Avatars are circular and status dots use the correct semantic colors.
- [ ] Channel categories are uppercase, compact, and muted.
- [ ] Message spacing matches the selected density.
- [ ] Hover states use modifier backgrounds instead of random solid colors.
- [ ] Scrollbars, menus, modals, and tooltips use the defined layer colors.
- [ ] Animations stay under `300ms`.
- [ ] Mobile layout has no overlapping text, hidden controls, or unreachable composer.

---

_Last updated: 2026-06-06._
