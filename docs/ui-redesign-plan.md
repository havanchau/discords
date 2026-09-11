# UI Redesign Phase Status

Phase tracker for the migration specified in
[`features/ui-identity-redesign.md`](features/ui-identity-redesign.md). Design rules and token values
are canonical in [`design-rules.md`](design-rules.md); this file records only what has shipped.

## Approach

Token-first, then surface by surface. Each phase converted one surface to CSS Modules and deleted
exactly the global CSS that surface owned, so the app built and ran after every step.

## Phases

| Phase | Surface | Status |
| --- | --- | --- |
| 0 | Tokens, themes, reset, contrast check | Done |
| 1 | Auth screen | Done |
| 2 | Shell, server rail, channel sidebar, member sidebar | Done |
| 3 | Chat header, panel, message list, composer, call tiles | Done |
| 4 | Settings modal, roles, permissions, invites | Done |
| 5 | Compatibility shim removed, docs rewritten | Done |

## What shipped

### Tokens and themes

- Two-tier token system in [`tokens.css`](../apps/web/src/styles/tokens.css): primitives plus
  semantic tokens, replacing 184 aliased tokens.
- Themes reduced from `dark` / `midnight` / `slate` / `oled` to `light` / `dark` / `system`, applied
  on `:root[data-theme]`. Stored legacy values migrate to `dark` on read; unrecognised values fall
  back to `system`.
- Contrast is enforced in CI by [`check-token-contrast.mjs`](../scripts/check-token-contrast.mjs)
  against the `@contrast-pairs` block in `tokens.css` — 31 pairings across both themes, covering text
  contrast, avatar tints, and the luminance separation between adjacent surfaces.

### Styling architecture

All eight global stylesheets were retired. `apps/web/src/styles/` now holds only `tokens.css`,
`reset.css`, `utilities.css`, and `keyframes.css`; every component styles itself through a sibling
`.module.css`.

### Component structure

`WorkspaceSidebar` (505 lines) split into [`workspace/`](../apps/web/src/components/workspace/):
`ServerRail`, `ChannelSidebar`, `ChannelList`, `WorkspaceDialogs`, and a shared `types.ts`.
`WorkspaceSidebar.tsx` remains as the composer and the stable import path.

### Defects fixed

- Server rail active indicator drawn inside the rail's padding box, so it no longer clips or escapes
  at `x=0`.
- Workspace banner gradient and its decorative shapes removed.
- Chat header reduced to three call actions, notifications, and search, with the remaining channel
  actions behind an overflow menu; the search field adopts the shared control height.
- Member row subtitle carries one kind of information (highest named role, `@everyone` excluded);
  presence moved entirely to the status dot, which gained an accessible label.
- Channel sidebar and chat panel converted from fixed grid templates to flex columns — the previous
  templates mis-assigned rows whenever a conditional child was absent, which stretched the user strip
  to 598px and unpinned the composer.
- `Button` `primary` and `danger` variants set `--text-on-accent`; `secondary` no longer renders with
  the primary background.
- Inputs gained a visible border, which they lacked entirely in the light theme.
- `accentClass()` avatar tints were referenced but never defined in any stylesheet; six accessible
  tints now exist as tokens.
- The channel search toggle had no effect because both its states resolved to `display: grid`.

## Remaining

- `AppShell.tsx` (784 lines), `MessageRow.tsx` (510), and `UtilityPanel.tsx` (363) are still above the
  250-line component guideline. They are under the 1000-line hard limit and are structural work only;
  no styling depends on them.
