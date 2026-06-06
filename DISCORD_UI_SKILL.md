# Discord UI Skill — Mandatory Rules for Codex

> **CRITICAL**: This file is the SINGLE SOURCE OF TRUTH for all UI work. Read it COMPLETELY before writing ANY CSS or JSX. Violations of these rules are build-breaking errors.

---

## ⚠️ THE #1 RULE: LOOK LIKE DISCORD, NOT A GENERIC APP

The UI MUST look like Discord's actual desktop app. NOT a landing page. NOT a dashboard. NOT a neon/cyberpunk theme. NOT glassmorphism. NOT Material UI. The goal is a **warm dark chat application** with **dense information layout**.

If your output has any of these, you have FAILED:

- Cyan/neon glows (`#00e5ff`, `#00ff95`, `#ff1fb8`, etc.)
- Gradient backgrounds on panels
- Glowing borders or box-shadows with color
- Cards inside cards
- Hero sections, marketing blocks, or decorative dashboards
- Pure black (`#000000`) backgrounds
- Rounded corners > 16px on the app shell
- Decorative radial/linear gradients on the body or app shell

---

## 1. Codex Skill to Use

Use **`ui-polish`** for all visual UI work. This skill audits layout, spacing, color, and interaction states.

When to use it:

- Fixing ugly or generic-looking components
- Auditing screenshots for Discord accuracy
- Fixing spacing, overflow, hierarchy, and responsive issues
- After any frontend change, verify with desktop and mobile screenshots

---

## 2. Implementation Checklist Requirement

Before implementing any UI task, create a task checklist.

- Start each not-yet-done item with `- [ ]`.
- Change an item to `- [x]` only after the exact work is complete and verified.
- Never check an item that is pending, partially done, blocked, untested, or only visually assumed.
- Keep the checklist updated as work progresses.
- Include verification tasks for screenshots, accessibility, lint/typecheck, or build when relevant.

---

## 3. Library-First UI Implementation

UI work MUST be library-first. Raw CSS is forbidden unless it is strictly required for Discord tokens, exact app-shell layout constraints, or targeted responsive fixes.

Use existing or task-approved libraries for:

- Icons.
- Accessible dialogs, menus, tooltips, tabs, toggles, and popovers.
- Form controls.
- Virtualized lists or complex scrolling behavior.
- Motion primitives when animation is needed.
- Date/time, markdown, upload, and media UI helpers.

Rules:

- Do not hand-roll complex UI behavior that a proven library already covers.
- Do not create raw CSS for UI behavior or styling when a component, utility, or existing class pattern can do the job.
- Custom CSS is allowed only when needed to apply Discord tokens, exact shell dimensions, targeted responsive fixes, or narrowly scoped component polish.
- Any custom CSS must be minimal, token-based, scoped to the relevant component/surface, and justified by the implementation context.
- If adding a new library, keep it narrow, maintained, and aligned with the existing React/Vite stack.

---

## 4. Exact Color Tokens (MANDATORY — DO NOT INVENT COLORS)

Every UI surface MUST use these exact CSS custom properties. **Never hardcode hex values** outside this list. **Never use neon, cyan, lime, or pink accent colors.**

```css
:root {
  /* === Surface layers (warm dark grays, NOT pure black) === */
  --background-floating: #111214;
  --background-tertiary: #1e1f22; /* Server rail, deepest panels */
  --background-secondary-alt: #232428;
  --background-secondary: #2b2d31; /* Channel sidebar, member sidebar */
  --background-primary: #313338; /* Main chat area */
  --background-accent: #4e5058;

  /* === Text === */
  --text-normal: #dbdee1;
  --text-muted: #80848e;
  --text-link: #00a8fc;
  --header-primary: #f2f3f5;
  --header-secondary: #b5bac1;

  /* === Interactive states === */
  --interactive-normal: #b5bac1;
  --interactive-hover: #dbdee1;
  --interactive-active: #ffffff;
  --interactive-muted: #4e5058;

  /* === Brand (Discord Blurple) === */
  --brand-color: #5865f2;
  --brand-hover: #4752c4;
  --brand-active: #3c45a5;

  /* === Status === */
  --status-online: #23a55a;
  --status-idle: #f0b232;
  --status-dnd: #f23f43;
  --status-offline: #80848e;

  /* === Modifiers (semi-transparent overlays) === */
  --background-modifier-hover: rgba(79, 84, 92, 0.16);
  --background-modifier-active: rgba(79, 84, 92, 0.24);
  --background-modifier-selected: rgba(79, 84, 92, 0.32);
  --background-message-hover: rgba(2, 2, 2, 0.06);

  /* === Input === */
  --input-background: #1e1f22;
  --input-placeholder: #87898c;

  /* === Mentions === */
  --mention-foreground: #c9cdfb;
  --mention-background: rgba(88, 101, 242, 0.3);

  /* === Danger === */
  --status-danger: #ed4245;
  --button-danger-background: #da373c;
}
```

### Forbidden Colors

These colors MUST NOT appear anywhere in the CSS:

- `#00e5ff` (neon cyan)
- `#ff1fb8` (neon pink)
- `#00ff95` or `#3cffb0` (neon green/lime)
- `#8f78ff` (neon violet)
- `#ffb000` (neon amber — use `#f0b232` for idle status instead)
- Any `rgba(0, 229, 255, ...)` variations
- Any neon glow `box-shadow` values

---

## 5. App Shell Layout (EXACT DIMENSIONS)

The app uses a **4-column grid** on desktop. No decorative borders, no border-radius on the shell, no gradient backgrounds.

```
+-------------+------------------+--------------------------+----------------+
| Server Rail | Channel Sidebar  | Chat Area                | Member Sidebar |
| 72px        | 240px            | flex: 1, min 460px       | 240px          |
+-------------+------------------+--------------------------+----------------+
```

```css
.app-shell {
  height: 100vh;
  display: grid;
  grid-template-columns: 72px 240px minmax(0, 1fr) 240px;
  overflow: hidden;
  /* NO border, NO border-radius, NO gradient background, NO box-shadow */
  background: var(--background-tertiary);
}
```

### Panel backgrounds (FLAT, NO GRADIENTS)

| Panel           | Background                |
| --------------- | ------------------------- |
| Server rail     | `#1e1f22` — flat, solid   |
| Channel sidebar | `#2b2d31` — flat, solid   |
| Chat area       | `#313338` — flat, solid   |
| Member sidebar  | `#2b2d31` — flat, solid   |
| Headers         | inherit from parent panel |

**NEVER** use `linear-gradient()` or `radial-gradient()` on panel backgrounds.

---

## 6. Fixed Dimensions

| Element                | Value  |
| ---------------------- | ------ |
| Channel header height  | `48px` |
| Channel row height     | `34px` |
| Member row height      | `42px` |
| Composer min height    | `44px` |
| Message toolbar height | `32px` |
| Server icon size       | `48px` |

---

## 7. Typography

```css
font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

| Role           | Size | Weight | Usage                             |
| -------------- | ---- | ------ | --------------------------------- |
| Modal title    | 24px | 700    | Major headings                    |
| Panel title    | 20px | 600    | Section headers                   |
| Channel name   | 16px | 600    | Sidebar items, card title         |
| Chat message   | 16px | 400    | Message body                      |
| UI label       | 14px | 400    | Menus, tooltips, buttons          |
| Timestamp      | 12px | 400    | Timestamps, metadata              |
| Badge          | 10px | 600    | Notification badges               |
| Category label | 11px | 600    | UPPERCASE, letter-spacing: 0.02em |

---

## 8. Component Patterns

### Server Icons (Squircle → Circle on hover)

```css
.server-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px; /* squircle at rest */
  background: var(--background-tertiary);
  transition:
    border-radius 150ms ease,
    background-color 150ms ease;
}
.server-icon:hover,
.server-icon.active {
  border-radius: 50%; /* circle on hover/active */
  background: var(--brand-color);
}
```

### Channel Rows

```css
.channel-item {
  height: 34px;
  margin: 1px 8px;
  padding: 0 8px;
  border-radius: 4px;
  color: var(--text-muted);
  gap: 6px;
}
.channel-item:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.channel-item.active {
  background: var(--background-modifier-selected);
  color: var(--header-primary);
}
```

### Messages

```css
.message {
  padding: 2px 16px 2px 72px;
  min-height: 22px;
}
.message.first-in-group {
  margin-top: 17px;
}
.message:hover {
  background: var(--background-message-hover);
}
```

### Buttons

```css
.btn-primary {
  background: var(--brand-color);
  color: #ffffff;
  border: none;
  border-radius: 3px;
  min-height: 38px;
  padding: 2px 16px;
  font-size: 14px;
  font-weight: 500;
}
.btn-primary:hover {
  background: var(--brand-hover);
}
.btn-primary:active {
  background: var(--brand-active);
}

.btn-danger {
  background: var(--button-danger-background);
  color: #ffffff;
}
```

### Inputs

```css
.input {
  background: var(--input-background);
  border: none;
  border-radius: 4px;
  color: var(--text-normal);
  min-height: 40px;
  padding: 10px;
}
.chat-input {
  background: #383a40;
  border-radius: 8px;
  min-height: 44px;
}
```

### Modals

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
}
.modal {
  background: var(--background-primary);
  border-radius: 8px;
  max-width: 560px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.54);
}
```

---

## 9. Spacing (base-4 scale)

```
4px | 8px | 12px | 16px | 20px | 24px | 32px | 40px
```

| Element                | Spacing             |
| ---------------------- | ------------------- |
| Channel row padding    | `0 8px`             |
| Message padding        | `2px 16px 2px 72px` |
| First message in group | `16px 16px 0 72px`  |
| Composer margin        | `0 16px 24px`       |
| Sidebar padding-top    | `8px`               |
| Modal body padding     | `16px 20px`         |

---

## 10. Radius Tokens

| Component         | Radius |
| ----------------- | ------ |
| Channel row       | `4px`  |
| Button            | `3px`  |
| Input / Composer  | `8px`  |
| Avatar            | `50%`  |
| Server icon idle  | `16px` |
| Server icon hover | `50%`  |
| Context menu      | `4px`  |
| Modal             | `8px`  |

---

## 11. Motion (SHORT and FUNCTIONAL only)

| Transition              | Duration |
| ----------------------- | -------- |
| Hover color/opacity     | `100ms`  |
| Server icon radius      | `150ms`  |
| Context menu appear     | `100ms`  |
| Modal fade+scale        | `200ms`  |
| Sidebar expand/collapse | `300ms`  |

**NEVER** animate:

- Layout changes during typing/scrolling
- Large-area background color changes
- Decorative pulse/glow/shimmer effects
- Parallax or scroll-linked animations

---

## 12. Z-Index Scale (DO NOT INVENT VALUES)

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

---

## 13. Interaction States Checklist

Every interactive component MUST have these states:

- [ ] **Default** — muted, not attention-grabbing
- [ ] **Hover** — subtle background change via `--background-modifier-hover`
- [ ] **Active/Selected** — stronger background via `--background-modifier-selected`
- [ ] **Focus-visible** — `2px solid var(--brand-color)` outline
- [ ] **Disabled** — `opacity: 0.5; cursor: not-allowed`
- [ ] **Loading** — skeleton or spinner, NOT empty space

---

## 14. Anti-Patterns (INSTANT REJECTION)

| ❌ DO NOT                                | ✅ DO INSTEAD                                        |
| ---------------------------------------- | ---------------------------------------------------- |
| Pure black `#000000` backgrounds         | Warm dark `#1e1f22`, `#2b2d31`, `#313338`            |
| Neon/cyan/pink accent colors             | Discord Blurple `#5865f2`                            |
| Gradient panel backgrounds               | Flat solid colors from the token list                |
| Glowing box-shadows                      | Subtle `rgba(0,0,0,...)` shadows only                |
| Borders on every panel edge              | Background layering for visual separation            |
| Cards nested inside cards                | Flat regions with background difference              |
| Old blurple `#7289DA`                    | Current blurple `#5865f2`                            |
| Hero headings in compact panels          | Dense headings matching surface context              |
| Animation on every state change          | Short transitions for hover, modal, menu, toast only |
| Body/shell gradients                     | Solid `var(--background-tertiary)` on body           |
| Decorative `::before`/`::after` overlays | Clean flat surfaces, no CSS art                      |
| Marketing-style empty states             | Functional empty states with action buttons          |
| Hand-rolled complex UI behavior          | Use proven React/accessibility/component libraries   |
| Large raw CSS rewrites                   | Use existing component patterns and minimal CSS      |

---

## 15. Responsive Rules

1. **Tablet**: Hide member sidebar first
2. **Mobile**: Single-column, navigation via explicit controls
3. **Never** compress chat area below readable message width
4. **Never** let the composer become unreachable on mobile
5. **Never** overlap text with icons on small screens

---

## 16. Verification Workflow

After ANY UI change:

1. Check that **all 4 panels** use the correct flat background colors
2. Check that **no neon/gradient/glow** exists anywhere
3. Check that **Blurple `#5865f2`** is used for primary actions
4. Check that **text contrast** is readable on all surfaces
5. Check that **server icons** use squircle→circle hover transition
6. Check that **channel rows** are 34px with correct padding
7. Check that **messages** are properly grouped with correct padding
8. Verify at **desktop (1440px)** and **mobile (375px)** widths
9. Run `npm run lint` and `npx tsc --noEmit`
10. Confirm the implementation checklist is truthful: only completed work is checked

---

## 17. File References

- Canonical design rules: `docs/design-rules.md`
- App shell component: `apps/web/src/AppShell.tsx`
- CSS tokens and styles: `apps/web/src/styles.css`
- Channel sidebar: `apps/web/src/components/WorkspaceSidebar.tsx`
- Chat surface: `apps/web/src/components/ChatPanel.tsx`
- Member sidebar: `apps/web/src/components/MemberSidebar.tsx`
- Settings: `apps/web/src/components/SettingsModal.tsx`
- UI spec summary: `docs/ui-design-spec.md`

---

_Last updated: 2026-06-06. This file overrides any conflicting instructions from other documents._
