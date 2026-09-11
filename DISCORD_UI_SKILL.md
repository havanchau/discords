# UI Enforcement Checklist

Agent-facing checklist for UI work in this repository. It mirrors
[`docs/design-rules.md`](docs/design-rules.md), which is canonical; this file defines no values of
its own.

## Before you write any UI code

1. Read [`docs/design-rules.md`](docs/design-rules.md).
2. Open [`apps/web/src/styles/tokens.css`](apps/web/src/styles/tokens.css) and use the semantic
   token that already exists rather than inventing a value.
3. Look for an existing primitive in [`apps/web/src/components/ui/`](apps/web/src/components/ui/)
   before building a control.
4. Write a checklist and keep it honest: a task is checked only after it is verified.

## The rules that get work rejected

- **No hardcoded colours.** Every colour resolves to a semantic token.
- **No primitive tokens in components.** `--gray-*`, `--accent-500`, and friends belong to
  `tokens.css` only; components use `--surface-*`, `--text-*`, `--border-*`, `--accent`, `--state-*`.
- **No new file in `apps/web/src/styles/`.** Component styles go in a sibling `.module.css`.
- **No rebuilt primitives.** Use `Button`, `IconButton`, `TextField`, `Avatar`, `Dialog`,
  `DropdownMenu`, `ContextMenu`, `Popover`, `Tooltip`, `Toast` from `components/ui/`.
- **No icon-only control without an accessible label** and a tooltip.
- **No fixed `grid-template-rows` over conditional children.** Use a flex column; a grid template
  shifts every row when an optional child is absent.
- **No blank region.** Loading, empty, and error states are all handled.
- **No decorative element** that carries no information.
- **No lowered contrast threshold** to make a colour fit. Fix the colour.
- **No source file over 1000 lines**; components stay near 250.

## Both themes, every time

`light` and `dark` both ship. A change is not done until the surface has been checked in both, at
1440px and at 390px, with no horizontal scroll.

## Verification

```bash
npm run typecheck
npm run lint
npm run test --workspace apps/web
npm run build --workspace apps/web
npm run ui:scan
npm run check:file-size
```

`npm run ui:scan` includes the token contrast check, which fails the run if any declared text/surface
pairing drops below its WCAG threshold in either theme. Do not edit the thresholds to pass it.

## Where things live

| Concern | Location |
| --- | --- |
| Tokens and themes | [`apps/web/src/styles/tokens.css`](apps/web/src/styles/tokens.css) |
| Reset and focus ring | [`apps/web/src/styles/reset.css`](apps/web/src/styles/reset.css) |
| Global helpers | [`apps/web/src/styles/utilities.css`](apps/web/src/styles/utilities.css) |
| Shared primitives | [`apps/web/src/components/ui/`](apps/web/src/components/ui/) |
| Shell grid | [`apps/web/src/components/app/AppLayout.module.css`](apps/web/src/components/app/AppLayout.module.css) |
| Theme resolution | [`apps/web/src/hooks/useTheme.ts`](apps/web/src/hooks/useTheme.ts) |
| Contrast check | [`scripts/check-token-contrast.mjs`](scripts/check-token-contrast.mjs) |
| Canonical rules | [`docs/design-rules.md`](docs/design-rules.md) |
| Migration record | [`docs/features/ui-identity-redesign.md`](docs/features/ui-identity-redesign.md) |
