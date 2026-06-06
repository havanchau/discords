# Discord UI Skill Notes

Use Codex's `ui-polish` skill for visual UI work in this repository.

The canonical implementation rules are in `docs/design-rules.md`. This file only explains how to use those rules with an AI coding agent, so it does not duplicate design tokens or component recipes.

## When to Use `ui-polish`

Use it for:

- Improving Discord-like UI quality.
- Auditing screenshots.
- Fixing spacing, hierarchy, overflow, mobile layout, and interaction states.
- Verifying desktop and mobile screenshots after frontend changes.

## Agent Workflow

1. Read `docs/design-rules.md`.
2. Inspect the existing React component before editing.
3. Prefer existing CSS variables and class patterns in `apps/web/src/styles.css`.
4. Fix broken interactions before visual styling.
5. Keep the app shell dense and functional.
6. Verify at desktop and mobile viewport sizes.
7. Run lint, typecheck, build, or UI smoke checks when the change affects frontend behavior.

## Non-Negotiables

- No marketing-style app shell.
- No decorative dashboards inside the chat app.
- No glassmorphism or decorative gradients.
- No nested decorative cards.
- No inaccessible icon-only buttons.
- No mobile text overlap or unreachable composer.

## References

- Canonical UI rules: `docs/design-rules.md`
- UX summary: `docs/ui-design-spec.md`
- Architecture mapping: `docs/architecture.md`
