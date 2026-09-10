# UI Design Agent Specification

## 1. Goal & Acceptance Criteria

### Objective
Create a specialized **Design Agent** (`DESIGN_AGENT.md`) to recheck, audit, and refactor the UI of the Discord clone web app (`apps/web`). The agent ensures complete visual alignment with the canonical Discord desktop client rules (`docs/design-rules.md`, `DISCORD_UI_SKILL.md`, `docs/ui-design-spec.md`).

### Acceptance Criteria
- [ ] Create `docs/features/ui-design-agent.md` documenting agent scope, audit criteria, and refactoring workflow.
- [ ] Create `DESIGN_AGENT.md` in the root repository containing the Design Agent system prompt, rules, and `define_subagent` configuration.
- [ ] Reference `DESIGN_AGENT.md` in `AGENT.md`.
- [ ] Provide clear checklist rules for auditing colors, layout spacing, file size limits (<1000 lines), and CSS token usage.

## 2. Scope & Current State

### Current State
- The frontend codebase in `apps/web/src` contains components such as `AppShell.tsx` (over 22KB), `WorkspaceSidebar.tsx`, `MemberSidebar.tsx`, `ChatPanel.tsx`, and CSS modules.
- Some components have loose styling and need strict visual auditing against Discord's design system.

### In-Scope
- Creating the Design Agent definition file (`DESIGN_AGENT.md`).
- Documenting the UI Audit & Polish process.
- Updating root `AGENT.md` to integrate the Design Agent entry point.

### Out-of-Scope
- Modifying backend API logic (`apps/api`) or database schemas.

## 3. Technical Approach

### Files to create/modify
1. `docs/features/ui-design-agent.md`: Feature documentation.
2. `DESIGN_AGENT.md`: Design Agent specification & system prompt.
3. `AGENT.md`: Add Design Agent pointer.

### Audit Criteria for Design Agent
- **Colors**: Strict adherence to `#1e1f22`, `#2b2d31`, `#313338`, `#5865f2`.
- **Forbidden Elements**: No gradients on panels, no neon colors (`#00e5ff`, `#ff1fb8`, `#00ff95`), no colored box-shadow glows.
- **Layout**: 4-column structure (72px server rail → 240px channel sidebar → flex chat timeline → 240px member sidebar).
- **Code Limits**: Keep file sizes strictly under 1000 lines.

## 4. Risks & Verification Plan

- **Risk**: Oversized component files (`AppShell.tsx`) breaking during refactoring.
- **Mitigation**: Split oversized files into modular sub-components prior to styling fixes.
- **Verification**: `npm run typecheck` and `npm run docs:check`.
