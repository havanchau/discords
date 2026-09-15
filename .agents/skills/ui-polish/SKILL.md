---
name: ui-polish
description: >-
  UI workflow for the Discord clone web client. Use when modifying React components, CSS modules,
  colours, spacing, typography, responsive layouts, or themes in apps/web.
---

# UI Polish Skill

Workflow for frontend, React, CSS, and UI component tasks in this repository. This skill defines no
rules or token values of its own; it points to the documents that own them.

## Canonical Pointers

1. **Design rules**: [docs/design-rules.md](../../../docs/design-rules.md)
2. **Agent UI checklist**: [DISCORD_UI_SKILL.md](../../../DISCORD_UI_SKILL.md)
3. **UX acceptance criteria**: [docs/ui-design-spec.md](../../../docs/ui-design-spec.md)
4. **Token values**: [apps/web/src/styles/tokens.css](../../../apps/web/src/styles/tokens.css)

## Workflow

1. Read the design rules and the agent UI checklist in full.
2. Find the semantic token in `tokens.css` and the primitive in `apps/web/src/components/ui/` before
   writing anything new.
3. Write a task checklist; check an item only after it is verified.
4. Implement with component-scoped `.module.css` and semantic tokens only.
5. Check the surface in light and dark themes, at 1440px and 390px.
6. Run the verification commands listed in `DISCORD_UI_SKILL.md`, including `npm run ui:scan`.
