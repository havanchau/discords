# UI Design Rules

Canonical UI rules for the web client. Values live in code — [`apps/web/src/styles/tokens.css`](../apps/web/src/styles/tokens.css)
is the single source of truth for every colour, space, radius, and type step. This document explains
how to use them; it does not restate them.

[`../DISCORD_UI_SKILL.md`](../DISCORD_UI_SKILL.md) is the agent-facing checklist and must link back
here rather than define competing values.

## Product direction

A dense, real chat application — not a marketing page and not a decorated demo.

- **Hierarchy comes from surface elevation**, not from shadows, gradients, blur, or borders. Four
  surface levels separate the app regions: `sunken` (server rail), `base` (app frame and chat
  canvas), `raised` (sidebars, cards), `overlay` (modals, popovers, menus).
- **One accent**, used for primary actions and the active state. Everything else is neutral or one
  of the four semantic state colours.
- **Utility before decoration.** Every visible element supports navigation, communication,
  moderation, calling, settings, or feedback. Elements that carry no information are removed.
- **Dense but scannable.** Reduce wasted space while keeping grouping and row rhythm readable.
- **Light and dark are equals.** Both themes ship, and every surface must render correctly in both.

Avoid: hero sections inside the app, fake analytics or KPI widgets, glassmorphism, neon palettes,
decorative gradients, and blank regions where the product should show channels, members, messages,
presence, or controls.

## Token system

Two tiers, both declared in [`tokens.css`](../apps/web/src/styles/tokens.css):

- **Primitive** — the raw palette (`--gray-*`, `--accent-*`, `--green-*`, `--avatar-tint-*`) and the
  raw metrics. **Never reference a primitive from a component.**
- **Semantic** — the tier components consume: `--surface-*`, `--text-*`, `--border-*`, `--accent*`,
  `--state-*`, `--space-*`, `--radius-*`, `--font-*`, `--control-height-*`, `--motion-*`, `--z-*`.

Rules:

- A component may only use semantic tokens. No hardcoded colour literals, anywhere.
- Adding a token means adding it to `tokens.css` for **both** themes.
- A value used by exactly one component is not a token; declare it in that component's module.

### Themes

`light`, `dark`, and `system` are set on `:root[data-theme]` by
[`useTheme.ts`](../apps/web/src/hooks/useTheme.ts). `system` resolves against `prefers-color-scheme`
and re-evaluates when it changes. The attribute lives on `:root` rather than `body` so portalled
Radix content is themed too.

### Contrast is enforced, not reviewed

[`tokens.css`](../apps/web/src/styles/tokens.css) ends with an `@contrast-pairs` block declaring the
minimum ratio for each text/surface pairing and for the separation between adjacent surfaces.
`npm run ui:scan` runs [`check-token-contrast.mjs`](../scripts/check-token-contrast.mjs) against it in
both themes and fails below threshold.

Changing a token means re-running the check. If a pairing is no longer meaningful, remove the pair
deliberately — do not lower a threshold to make a colour fit.

## Styling architecture

- **CSS Modules per component.** A component's styles live next to it as `<Component>.module.css`.
- `apps/web/src/styles/` holds only: `tokens.css`, `reset.css`, `keyframes.css`, and
  `utilities.css`. Nothing else global may be added.
- `utilities.css` is limited to classes applied by a helper function or shared across unrelated
  surfaces (`accent-*` avatar tints from `accentClass()`, `avatar`, `spin`, `empty-note`).
- Compose classes with `clsx` through [`cn()`](../apps/web/src/utils/cn.ts).
- Do not use CVA; the variant surface is small enough for token-based classes plus `cn`.

### Layout

Prefer flex columns over fixed `grid-template-rows` for any container with conditional children.
A grid template silently shifts every row when an optional child is absent — this caused both the
channel sidebar and the chat panel to mis-lay-out, and is why those surfaces are flex today.

Each surface owns its own breakpoints in its own module. The shell
([`AppLayout.module.css`](../apps/web/src/components/app/AppLayout.module.css)) only decides how many
columns the grid offers; a sidebar hides itself.

## Component rules

- Build on the primitives in [`components/ui/`](../apps/web/src/components/ui/) — `Button`,
  `IconButton`, `TextField`, `TextArea`, `Avatar`, `Dialog`, `DropdownMenu`, `ContextMenu`,
  `Popover`, `Tooltip`, `Toast`, `Checkbox`, `Switch`. Do not rebuild them out of raw elements.
- Controls share `--control-height-sm|md|lg`. A search field and a button on the same row must be
  the same height.
- Every icon-only control carries an accessible label and a tooltip.
- A row's subtitle slot carries **one** kind of information. Do not mix a role with a presence
  status in the same position.
- Presence is conveyed by the status dot, which carries its own accessible label.
- Handle loading, empty, and error states explicitly. Never ship a blank region.
- A non-interactive row is informational, not disabled: it keeps readable contrast.

## Accessibility

- Body text meets 4.5:1; large text, borders, and UI boundaries meet 3:1. Enforced by the contrast
  check above.
- Focus is always visible: `reset.css` applies a `--border-focus` ring to every focusable element.
- Motion respects `prefers-reduced-motion`; the global escape hatch lives in `reset.css`, so a
  component never repeats the query.
- Interactive targets are at least `--control-min-size`.

## Anti-patterns

- A hardcoded colour in a component.
- A primitive token referenced outside `tokens.css`.
- A new file in `apps/web/src/styles/`.
- A fixed grid row template over conditional children.
- Lowering a contrast threshold instead of fixing the colour.
- An icon button with no label.
- A decorative element that carries no information.

## File size

No source file over 1000 lines (`npm run check:file-size`). Components should stay near 250 lines;
past that, extract a hook or split the component.

## Verification

```bash
npm run typecheck
npm run lint
npm run test --workspace apps/web
npm run build --workspace apps/web
npm run ui:scan
npm run check:file-size
```

For any visual change, also check the surface at 1440px and 390px, in both themes, and confirm no
horizontal scroll.
