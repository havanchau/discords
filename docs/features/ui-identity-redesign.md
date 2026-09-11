# UI Identity Redesign

Feature spec for replacing the current "cyber glass" visual identity with a neutral, surface-driven
design system, and for finishing the migration of all global CSS into component-scoped CSS Modules.

This document is the canonical source for the migration. Token values land in
[`../design-rules.md`](../design-rules.md); phase status is tracked in
[`../ui-redesign-plan.md`](../ui-redesign-plan.md).

## Goal

Two problems are being solved together because they share a root cause — the styling layer has no
single owner:

1. **The interface reads as flat and unfinished.** Surfaces are too close in luminance to separate
   app regions, decorative elements do not belong to any colour system, and control sizing is
   inconsistent between the header, the sidebar, and the composer.
2. **Styling lives in two competing places.** 2,700 lines of globally-scoped CSS across eight
   stylesheets sit alongside ten `.module.css` files. The same element can be styled from either,
   and neither wins predictably.

### Acceptance criteria

- Every colour, spacing, radius, and typography value used by a component resolves to a semantic
  token. No hardcoded colour literals outside the token file.
- `apps/web/src/styles/` contains only token, reset, keyframe, and documented-utility files. No
  component class names.
- Every text/background pair in both themes meets WCAG AA (4.5:1 for body text, 3:1 for large text
  and UI boundaries), enforced by an automated check.
- `light` and `dark` themes both render every surface; users on a removed theme are migrated, not
  broken.
- No source file in `apps/web/src` exceeds 1000 lines. Components should sit near 250 lines.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run ui:scan`, and `npm run ui:smoke`
  pass.

## Scope

**In scope**

- A new two-tier token system (primitive → semantic) with `light` / `dark` / `system` themes.
- Migration of all 156 global class names into component-scoped CSS Modules.
- Visual rework of: app shell and server rail, channel sidebar, chat header, message list and rows,
  composer, member sidebar, auth screen, settings modal, home/DM surfaces.
- Splitting the four oversized components listed under [Current behavior](#current-behavior).
- Rewriting [`../design-rules.md`](../design-rules.md) and [`../../DISCORD_UI_SKILL.md`](../../DISCORD_UI_SKILL.md)
  to describe the new identity.

**Out of scope**

- Any change to API contracts, hooks, realtime behaviour, or data fetching. This is a presentation
  change; component props may change, data flow may not.
- New product features, new screens, new settings.
- The `apps/api` workspace.
- Replacing the existing Radix-based primitives in `apps/web/src/components/ui/`. They are reused
  as-is; only their CSS Modules are re-pointed at the new tokens.

## Current behavior

### Styling layer

| Stylesheet | Lines | Owns |
| --- | --- | --- |
| `styles/global.css` | 854 | 184 tokens, reset, auth screen, decorative space scene |
| `styles/settings-error.css` | 752 | Settings modal, roles, permissions, banners |
| `styles/message-overlays.css` | 399 | Composer, attachments, media preview, server/channel modals |
| `styles/member-home-loading.css` | 267 | Member list, member popover, spinner |
| `styles/responsive.css` | 221 | Media queries, ~85% of them for the auth screen |
| `styles.css` | 140 | Invites, permission preview |
| `styles/chat-layout.css` | 65 | Chat panel grid, call tiles |
| `styles/shell-navigation.css` | 64 | App shell grid, member sidebar |
| `styles/messages.css` | 54 | Avatar, status dot |

Component reuse is already healthy and is **not** the problem: `components/ui/` exports ten Radix-backed
primitives via [`ui/index.ts`](../../apps/web/src/components/ui/index.ts), 28 files import them, and only
11 raw `<button>` elements remain outside `components/ui/`.

### Token problems

- **Alias chains.** `--bg-secondary` → `--background-secondary` → `--color-bg-sidebar` are three names
  for one value. A component author has no way to know which is intended.
- **Names that lie.** `--glass-blur: none`, `--accent-gradient: #5a67d8` (a solid colour),
  `--glass-bg` (opaque) are leftovers from an abandoned direction.
- **Insufficient separation.** App background `#0b0f19` against panel `#111418` is a 1.1:1 luminance
  ratio — the region boundaries are not perceivable, which is the direct cause of the "flat" look.
- **Low-contrast text.** Muted text `#94a3b8` on `#0f172a` passes, but disabled/inactive channel rows
  render well below AA.

### Theme variants

[`useTheme.ts`](../../apps/web/src/hooks/useTheme.ts) supports `dark`, `midnight`, `slate`, `oled`,
persisted under the `localStorage` key `discord-clone-ui-theme`. `midnight` and `slate` are both
copies of Discord's palette at slightly different luminance and are not meaningfully distinguishable.

### Oversized components

| File | Lines |
| --- | --- |
| [`AppShell.tsx`](../../apps/web/src/AppShell.tsx) | 784 |
| [`components/chat/MessageRow.tsx`](../../apps/web/src/components/chat/MessageRow.tsx) | 510 |
| [`components/WorkspaceSidebar.tsx`](../../apps/web/src/components/WorkspaceSidebar.tsx) | 505 |
| [`components/chat/UtilityPanel.tsx`](../../apps/web/src/components/chat/UtilityPanel.tsx) | 363 |

### Observed visual defects

Captured before the change, from [`../screenshots/before/redesign-baseline-desktop.png`](../screenshots/before/redesign-baseline-desktop.png):

- The server rail clips its first icon and renders a stray element at `x=0`.
- The workspace banner is a purple gradient with an unrelated red disc and yellow bar.
- The chat header packs eight unlabelled icon buttons; the search field's height and radius match no
  other control.
- Member rows show a role for one member and a status for another in the same subtitle slot.
- Voice channel labels sit near the contrast floor.

## Changes

### Design language

The new identity replaces surface *decoration* with surface *elevation*. Hierarchy comes from
stepped background luminance, not from shadows, gradients, blur, or borders.

- **Four surface levels** — `base` (app frame), `sunken` (rail), `raised` (sidebars, cards),
  `overlay` (modals, popovers) — each separated by enough luminance to be perceivable in both themes.
- **One accent** for primary actions, plus four semantic colours (`success`, `warning`, `danger`,
  `info`). No decorative colour.
- **One font family.** `global.css` currently loads both Plus Jakarta Sans and Inter; only one ships.
- **Six-step type scale** and an 8px-based spacing scale.
- Decorative elements with no informational role are removed, including the auth screen's
  `space-scene` / `planet` / `star` / `meteor` composition and the workspace banner gradient.

### Token system

Two tiers, in `apps/web/src/styles/tokens.css`:

- **Primitive** — raw values (`--gray-50` … `--gray-900`, `--accent-400` … `--accent-700`). Never
  referenced by a component.
- **Semantic** — the only tier components may use:
  `--surface-base|sunken|raised|overlay`, `--text-primary|secondary|muted|disabled|on-accent`,
  `--border-default|strong|focus`, `--accent|--accent-hover|--accent-active`,
  `--state-success|warning|danger|info`, `--space-1…8`, `--radius-sm|md|lg|full`,
  `--font-size-xs…2xl`, `--z-*`.

Target: roughly 70 tokens, down from 184. Every alias chain is collapsed to its semantic name.

### Themes

`dark`, `midnight`, `slate`, `oled` collapse to `light`, `dark`, and `system`. Themes are declared on
`:root[data-theme]` rather than `body[data-theme]`, so tokens are available to portalled Radix content
that mounts outside `body`'s styled subtree.

`system` follows `prefers-color-scheme` and re-evaluates on change.

**Migration.** On read, `useTheme` maps stored legacy values: `midnight` → `dark`, `slate` → `dark`,
`oled` → `dark`, anything unrecognised → `system`. The mapped value is written back immediately so the
migration runs once. The `localStorage` key is unchanged.

### Further defects found during migration

These were not visible in the original screenshots; the light theme and the contrast check exposed
them. They are in scope because each is a defect in the token or primitive layer being rebuilt.

- `Button`'s `primary` and `danger` variants set an accent background but never set the foreground,
  so their label inherited `--text-primary` — unreadable dark-on-accent in the light theme.
- `Button`'s `secondary` variant used the primary background, making the two variants identical.
- Inputs had no border at all; against a white `raised` surface in the light theme they were
  invisible.
- `accentClass()` has always returned `accent-0` … `accent-5`, but no stylesheet ever defined those
  classes, so the per-user avatar tint never rendered. Six tints now exist as tokens, each verified
  against white text.
- The channel search toggle was inert: both of its states resolved to `display: grid`. It now shows
  and hides the field, and clears the query on close so the list is never left silently filtered.
- `UtilityPanel.module.css` referenced `--line-height-normal`, which was never declared.

### Visual defect fixes

- Server rail: fixed 72px track with the active-pill indicator drawn inside the rail's own padding
  box, so nothing clips or escapes at `x=0`.
- Workspace banner: gradient and decorative shapes removed; the banner becomes a solid `raised`
  surface carrying the workspace name and visibility badge.
- Chat header: icon actions grouped and reduced to the primary set, with overflow behind a menu;
  every icon button carries an accessible label and a tooltip. The search field adopts the shared
  `TextField` sizing.
- Member rows: the subtitle slot shows exactly one kind of information — the member's highest role
  when present, otherwise nothing. Presence is conveyed only by the status dot, which carries an
  accessible label.
- Channel rows: inactive and muted states are re-derived from tokens that meet AA.

### Component splits

`WorkspaceSidebar.tsx` splits into `components/workspace/`: `ServerRail`, `ChannelSidebar`,
`ChannelList`, `WorkspaceDialogs`, and a shared `types.ts`. `WorkspaceSidebar.tsx` stays as the
composer and the stable import path, so no consumer changes.

`AppShell.tsx`, `MessageRow.tsx`, and `UtilityPanel.tsx` remain above the 250-line guideline. They are
under the 1000-line hard limit, nothing in this change depends on their internals, and splitting them
is structural work with no visual effect — tracked as remaining in
[`../ui-redesign-plan.md`](../ui-redesign-plan.md) rather than bundled here.

Splits are mechanical: no behaviour change, no prop-contract change beyond what extraction requires.

### Edge cases

- Empty channel, empty member list, empty DM list, empty search — each gets an explicit empty state
  rather than blank space.
- Loading and error states already exist in markup; they are re-tokenised, not removed.
- Long workspace/channel/member names truncate with an accessible full value.
- `prefers-reduced-motion` disables the transitions introduced for hover and panel entry.

## Technical approach

CSS Modules with `clsx`, consistent with the existing `components/ui/` primitives and with the
direction already recorded in [`../ui-redesign-plan.md`](../ui-redesign-plan.md). No new runtime
dependency is introduced.

### Migration strategy

Token-first, then surface-by-surface. The new token file lands first and coexists with the old global
CSS; each subsequent phase converts one surface to modules and deletes exactly the global CSS that
surface owned. The app builds and runs after every phase.

| Phase | Surface | Global CSS retired |
| --- | --- | --- |
| 0 | Tokens, themes, reset, contrast check | token and reset blocks of `global.css` |
| 1 | Auth screen | auth block of `global.css`, auth block of `responsive.css` |
| 2 | Shell, server rail, channel sidebar, member sidebar | `shell-navigation.css`, `member-home-loading.css`, `messages.css` |
| 3 | Chat header, panel, message list, composer, call tiles | `chat-layout.css`, `message-overlays.css` |
| 4 | Settings modal, roles, permissions, invites | `settings-error.css`, `responsive.css`, settings block of `styles.css` |
| 5 | Compatibility shim removed, docs rewritten | `legacy-tokens.css` |

The auth screen moved ahead of the shell: enabling the light theme in phase 0 exposed a hardcoded
dark background on the auth panel that left its heading unreadable, so that surface could not be left
on global CSS.

A temporary `legacy-tokens.css` mapped every retired token name onto the new semantic tokens. It let
unmigrated stylesheets adopt the new identity immediately and shrank with each phase; phase 5 deleted
it once nothing referenced a legacy name.

### Contrast enforcement

`scripts/check-token-contrast.mjs` parses the `@contrast-pairs` block in `tokens.css`, resolves each
token through its `var()` chain, composites any alpha against its background, and fails the run when a
pairing drops below its threshold in either theme. It also checks the luminance separation between
adjacent surfaces, which is the measurable form of the "flat" complaint.

It ships as its own script rather than inside `ui-static-scan.mjs` — that file's job is forbidden
pattern matching — and `npm run ui:scan` runs both. Token values in this change were chosen by solving
against this checker, not by eye.

### Files touched

- New: `apps/web/src/styles/tokens.css`, `reset.css`, `utilities.css`, `keyframes.css`, and one
  `.module.css` per migrated component. `utilities.css` holds the classes a component cannot own
  because a helper function applies them (`accent-*` from `accentClass()`, `avatar`, `spin`,
  `empty-note`); `keyframes.css` holds animations shared by more than one surface.
- Rewritten: `apps/web/src/styles.css` (imports only), `apps/web/src/hooks/useTheme.ts`,
  `apps/web/src/contexts/appContexts.tsx` (the `UiTheme` union).
- Deleted at the end of their phase: the eight global stylesheets listed above.
- Docs: `docs/design-rules.md`, `DISCORD_UI_SKILL.md`, `docs/ui-redesign-plan.md`, `docs/README.md`.

## Trade-offs

**Token-first incremental migration over a single rewrite.** A big-bang rewrite touches ~30 TSX files
in one unreviewable change, with no safe stopping point. With 156 global class names referenced across
the tree and no visual regression testing in the repo — `ui:smoke` is a smoke test, not a snapshot
comparison — silent layout breakage is the likely outcome. The cost of the incremental path is a
transitional period where old and new tokens coexist; that is accepted because each phase is
independently revertible.

**Keeping the hand-written Radix primitives over adopting Tailwind or shadcn.** The primitives are the
part of the codebase that already works: ten components, 28 consumers, consistent API. The defect is
the token layer and the global CSS beneath them. Replacing the working layer to fix the broken one
adds a large dependency and a full rewrite of every consumer without addressing the cause.

**Collapsing four themes to two.** Keeping `midnight`, `slate`, and `oled` would preserve existing user
preferences exactly, but every new semantic token would need four values — roughly 140 hand-maintained
values for two variants most users cannot distinguish. Cost: users on a removed theme are moved to
`dark`. Mitigated by the read-time migration, which is silent and lossless in practice since all three
removed variants are dark.

**Two tiers of tokens rather than one flat set.** A flat set is simpler to read but makes palette
changes a find-and-replace across every semantic name. The primitive tier costs one level of
indirection and buys a single place to change the palette.

## Risks and rollback

| Risk | Mitigation |
| --- | --- |
| Silent layout breakage during migration — no visual regression tests exist | Each phase is a separate, independently revertible change; `ui:smoke` plus manual verification per phase at desktop and mobile widths |
| A deleted global class is still referenced by an unmigrated surface | Each phase deletes only the stylesheet it fully owns; a grep for the class names in the retired file gates the deletion |
| Portalled Radix content losing tokens when the theme moves to `:root` | Verified explicitly in Phase 0 against `Dialog`, `DropdownMenu`, `Popover`, `Tooltip`, `ContextMenu` |
| Users on `midnight`/`slate`/`oled` losing their preference | Read-time migration to `dark`; all three are dark variants, so the visible change is small |
| Scope creep from "while I'm here" refactors | Component splits are mechanical only; behaviour and data flow are explicitly out of scope |

**Rollback.** Each phase is a self-contained change that restores its global stylesheet and reverts its
module files. Phase 0 is the only one with a user-visible persistence effect; reverting it restores the
four-theme union, and a stored `dark` remains valid under the old code.

## Test plan

**Automated**

- `npm run lint`, `npm run typecheck`, `npm run build` after every phase.
- `npm run check:file-size` — enforces the line limits the splits are meant to satisfy.
- `npm run ui:scan` — extended with the token contrast check described above.
- `npm run ui:smoke` — existing smoke run. Two of its selectors targeted presentational class names
  from the deleted global stylesheets (`.file-input`, `.composer-reply`); both now use `data-testid`,
  matching the convention used by every other step.
- `npm run docs:check` — for the documentation rewrites.
- Unit tests for the `useTheme` legacy-value migration: each legacy value maps to `dark`, an
  unrecognised value maps to `system`, and the mapped value is persisted once.

`ui:smoke` has a pre-existing failure unrelated to this change: it clicks `button[title="Reply"]`,
and no such button exists in `MessageRow.tsx` — at this commit or at the one before it. Every other
step of the run passes (login, channel creation, upload, send, link preview, reaction, voice call,
search panel, mobile viewport). The missing button is left for whoever owns that feature.

**Manual verification per phase**

1. Start the app with `npm run dev:web`.
2. For the phase's surface, confirm at 1440px and at 390px: region boundaries are visible, no clipped
   or escaping elements, no horizontal scroll, controls share sizing.
3. Toggle `light` / `dark` / `system` and confirm the surface renders fully in each.
4. Open every Radix overlay reachable from the surface and confirm it is themed.
5. Tab through the surface and confirm focus is visible on every interactive element.

Screenshots in `docs/screenshots/ui-redesign/` show the current state; the pre-change desktop capture
is kept at `docs/screenshots/before/redesign-baseline-desktop.png` as the evidence for the defect list
above.

## Deployment notes

- No new environment variables, no migration, no API change.
- Web-only; `apps/api` is untouched and the two can deploy independently.
- First load after deploy runs the one-time `localStorage` theme migration in the browser. No server
  action and no cache invalidation is required.
- The service worker at `apps/web/public/sw.js` caches built assets; asset hashes change with the CSS
  rewrite, so a stale client keeps the old UI until the worker updates. Existing behaviour, no change
  required, but expect a one-refresh delay in the field.
