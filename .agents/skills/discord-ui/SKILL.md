---
name: discord-ui
description: >-
  Discord desktop client visual design system, component guidelines, and token rules.
  Use when building or updating Discord clone UI components, chat interfaces, server sidebars,
  channel lists, member panels, modal dialogs, or dark-mode theme styling.
---

# Discord UI System Skill

Provide complete UI guidelines and design system tokens for Discord desktop app clone surfaces.

## Canonical Pointers

- **Design System & Tokens**: [docs/design-rules.md](../../../docs/design-rules.md)
- **UI Specification**: [docs/ui-design-spec.md](../../../docs/ui-design-spec.md)
- **Agent Enforcement Guide**: [DISCORD_UI_SKILL.md](../../../DISCORD_UI_SKILL.md)


## Color Palette Tokens

```css
:root {
  /* Surfaces */
  --background-tertiary: #1e1f22;  /* Server rail */
  --background-secondary: #2b2d31; /* Sidebar, Member list */
  --background-primary: #313338;   /* Main chat timeline */
  --background-floating: #111214;  /* Modals, popovers */

  /* Text & Accents */
  --text-normal: #dbdee1;
  --text-muted: #80848e;
  --brand-experiment: #5865f2;     /* Discord Blurple */
  --status-positive: #23a55a;      /* Online green */
  --status-warning: #f0b232;       /* Idle yellow */
  --status-danger: #f23f43;        /* DND / Error red */
}
```

## UI Workflow Checklist

1. Read [docs/design-rules.md](../../../docs/design-rules.md) for full token specs.

2. Ensure 4-column layout structure is maintained.
3. Use library components (`lucide-react`, radix/headless primitives) first.
4. Verify flat solid backgrounds, no neon glows, and no linear/radial panel gradients.
5. Ensure component files remain under 1000 lines.
