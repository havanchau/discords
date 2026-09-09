---
name: ui-polish
description: >-
  Mandatory UI polish, layout auditing, and styling workflow for Discord clone frontend development.
  Use when modifying React components, CSS styles, colors, spacing, typography, responsive layouts,
  or UI component libraries to enforce Discord design system rules.
---

# UI Polish Skill — Discord Visual & Layout Polish Workflow

Follow this procedure for all frontend, React, CSS, and UI component tasks in this repository.

## Canonical Pointers

1. **Design System & Tokens**: [docs/design-rules.md](../../../docs/design-rules.md)
2. **UI Specification & UX Acceptance**: [docs/ui-design-spec.md](../../../docs/ui-design-spec.md)
3. **Agent Rulebook**: [DISCORD_UI_SKILL.md](../../../DISCORD_UI_SKILL.md)


## Core Guidelines & Workflow

### 1. Hard Visual Invariants
- **App Shell**: Flat, solid, warm-dark backgrounds (`#1e1f22`, `#2b2d31`, `#313338`). NO gradients on panels. NO rounded corners or borders on the outer shell.
- **Brand Color**: Discord Blurple (`#5865f2`) for primary actions and active states.
- **Strictly Forbidden**: Neon cyan (`#00e5ff`), neon pink (`#ff1fb8`), neon lime (`#00ff95`), colored glowing box-shadows, pure black (`#000000`) panel backgrounds, or Material/generic dashboards.
- **4-Column Layout**: Server rail (72px) → Channel sidebar (240px) → Flex chat timeline → Member sidebar (240px).

### 2. Implementation Rules
- **Library First**: Use established React UI, accessibility, icon (`lucide-react`), virtualized list, date/time, and motion libraries before writing custom CSS.
- **Minimal Token-Based CSS**: Custom CSS is allowed only when connecting library components to exact Discord layout constraints or design tokens.
- **File Size Limit**: Keep all UI components and CSS files under 1000 lines. Split oversized files (`AppShell.tsx`, `ChatPanel.tsx`, `WorkspaceSidebar.tsx`, `MemberSidebar.tsx`, `SettingsModal.tsx`) into modular sub-components.

### 3. Verification & Quality Assurance
- Run `npm run docs:check` to verify Markdown documentation links and structure.
- Run `npm run typecheck` to verify TypeScript types.
- Verify empty, loading, error, unauthorized, and responsive mobile states.
