# Feature Spec: UI Consistency Pass (Colour and Control Sizing)

This specification covers a consistency pass over colours and control sizes in the web client, so every surface follows [`../design-rules.md`](../design-rules.md) in both light and dark themes.

## Goal

Colours come only from semantic tokens and render correctly in both themes; controls on the same row share one height; typography uses the token scale. The rules already exist in `design-rules.md` — this pass fixes the places that break them and makes the static scan enforce them.

Acceptance criteria:

- No colour literal (`#hex`, `rgb()`/`rgba()`, named colours) in any `*.module.css`; `npm run ui:scan` fails if one is added.
- No `font-size` literal in any `*.module.css` except component-local custom properties (avatar initials, channel intro hero); `npm run ui:scan` fails otherwise.
- Every text button, input, and select trigger measures `--control-height-sm|md|lg` (32 / 38 / 44 px); every icon button measures 32 px unless it sits in the composer (44 px).
- A switch looks "off" when unchecked and "on" when checked, in both themes.
- Only one server-rail button looks active at a time.
- New contrast pair `text-on-danger on state-danger >= 4.5` passes in both themes.
- Screens checked at 1440 px and 390 px in both themes: auth, chat, search panel, profile / server / channel settings, create-server and create-channel dialogs, Direct Messages home.

## Scope

- **In Scope**: `apps/web/src/styles/tokens.css`, `components/ui/*` primitives, CSS modules and small markup changes in workspace, chat, home, settings, and auth components; `scripts/ui-static-scan.mjs`; `docs/design-rules.md` (rules only, no new values).
- **Out of Scope**:
  - New colours, a new accent, or a palette redesign.
  - Layout changes (e.g. the Direct Messages home showing two "Direct messages" headers across its columns) — noted separately.
  - Changing component structure beyond what a fix needs.

## Current Behavior

Measured with a headless Chrome pass over the screens listed above in both themes (computed height, font size, radius, colours of every visible control), plus a grep of all CSS modules.

### Colour

| #   | Where                                                                                  | What happens                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `components/ui/SelectionControls.module.css:44-62`                                     | Switch track is `--accent` when **unchecked** and `--state-success` when checked; thumb is `--text-primary` (near-black in light). An off switch reads as on (seen on "Private channel" in channel settings).                                                                                                                                         |
| C2  | `components/SettingsModal.module.css` lines 17, 253, 340, 449, 512, 667, 673, 710, 878 | Dark-only literals: `rgba(255,255,255,0.035–0.06)` borders/fills vanish in light; `rgba(88,101,242,0.16)` is Discord blurple, not `--accent`; `rgba(35,165,90,0.16)` is not `--state-success`; modal shadow bypasses `--shadow-overlay`. Affects role editor, permission tiles, audit log rows, member override cards, allowed chips, banner buttons. |
| C3  | `components/workspace/ServerRail.module.css:83-99`                                     | Home (Direct Messages) button is always `--accent`, so with a server open two rail buttons look active. "Add a server" uses `--state-success` green, a semantic colour used as decoration. Rail buttons render through `Button variant="primary"`, so `.primary` hover rules compete with rail rules.                                                 |
| C4  | `components/ui/Button.module.css:57-64`                                                | `danger` = white on `--state-danger`. Dark theme `--state-danger` is `--red-400` (#f2717a): white on it is ~2.6:1 (revoke-invite button). No contrast pair covers it.                                                                                                                                                                                 |
| C5  | `components/home/FriendsList.tsx` (empty lists)                                        | "No friends yet" / "No direct messages yet" render an info `Banner` (accent left border, message styling) for an empty list, while empty lists in settings (`ServerSettings.tsx:105,129`) use the muted `empty-note` utility.                                                                                                                         |
| C6  | `components/AuthScreen.module.css:50,71,87`                                            | White `rgba` literals on the accent brand panel instead of `--text-on-accent`.                                                                                                                                                                                                                                                                        |
| C7  | `components/SettingsModal.module.css` (sticky form footer)                             | Footer bar is wider than the section cards and uses a different surface, so it reads as a separate floating strip.                                                                                                                                                                                                                                    |

### Size

| #   | Control                                                                       | Measured                                                    | Expected                                                              |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| S1  | Header "Search" field (`ChatHeader.module.css:76`) next to 32 px icon buttons | 38 px, 12 px text                                           | 32 px, same row as the icons                                          |
| S2  | Channel sidebar "Search channels" `IconButton`                                | 38 px                                                       | 32 px like the other icon buttons                                     |
| S3  | `IconButton` with default size                                                | 38 px (`.md` `min-height` overrides `.iconButton` `height`) | 32 px                                                                 |
| S4  | `SettingsSelect` trigger (status, theme)                                      | 40 px, radius 4 px                                          | 38 px, `--radius-sm`                                                  |
| S5  | Native `<select>` in channel member overrides (`ChannelSettings.tsx:167`)     | 40 px, 12 px, radius 4 px, browser styling                  | `SettingsSelect`, 38 px                                               |
| S6  | Add-friend input                                                              | radius 8 px                                                 | `--radius-sm`                                                         |
| S7  | Composer input                                                                | 15.2 px text (`0.95rem`), radius 12 px                      | `--font-size-base`, `--radius-md`; height stays `--control-height-lg` |
| S8  | Message hover toolbar                                                         | emoji buttons 24 px next to 32 px icon buttons              | 32 px                                                                 |
| S9  | Member list rows                                                              | 40 px or 41 px depending on subtitle                        | one height                                                            |
| S10 | Settings switch row / radii                                                   | `min-height: 58px`, `border-radius: 8px` / `4px` literals   | tokens                                                                |

Root cause of S1–S3: `Button.module.css` `.md { min-height: var(--control-height-md) }` wins over a component's `height`, because `min-height` beats `height`.

### Typography

101 `font-size` literals across CSS modules. Most already equal a token value (`12px`, `14px`, `11px`, `18px`) and just bypass the token. Off-scale values:

| Literal                       | Count | Used for                                                                         |
| ----------------------------- | ----- | -------------------------------------------------------------------------------- |
| `13px`                        | 17    | meta text, names in lists, check rows, reply previews, quick reactions           |
| `15px`                        | 3     | settings section / role headings                                                 |
| `16px`, `1rem`                | 4     | message author name, DM header name, channel intro text, message avatar initials |
| `20px`                        | 3     | Direct Messages title, empty-state titles                                        |
| `0.95rem`, `0.875rem`, `10px` | 3     | composer input, reply preview, hover timestamp                                   |
| `24px`, `30px`                | 2     | call avatar initials, channel intro title                                        |

## Changes

### Colour

- **C1 Switch**: unchecked track `--border-strong`, checked track `--accent`, thumb `--text-on-accent` (white) in both themes. Focus ring uses `--border-focus` like every other control.
- **C2 Settings literals** → semantic tokens:
  - borders `rgba(255,255,255,0.05|0.06)` → `--border-default`;
  - fills `rgba(255,255,255,0.035)` → `--surface-hover`;
  - checked permission tile → `--accent-subtle` background with a 1 px inset `--accent` ring;
  - allowed chip → `color-mix(in srgb, var(--state-success) 16%, transparent)` with `--state-success` text (same `color-mix` pattern already used in `HomePanel.module.css:223`);
  - error banner text and its buttons → `--text-on-danger` (they sat on `--state-danger` with `--text-primary`); button fills `--surface-hover` / `--surface-active`;
  - modal shadow → `--shadow-overlay`;
  - literal radii in `SettingsModal.module.css` and `HomePanel.module.css`: ≤ 6 px → `--radius-sm`, 8–12 px → `--radius-md`, 999 px → `--radius-full`; inputs and row buttons use `--radius-sm`;
  - headings mapped to `--font-size-base` use `--font-weight-semibold`.
- **C3 Server rail**: rail buttons use `Button variant="ghost"`. Home button is neutral like any server and becomes `--accent` only when active. "Add a server" is neutral with `--text-muted` icon; hover uses `--accent-subtle` background and `--accent` icon.
- **C4 Danger**: new semantic token `--text-on-danger`: `--gray-0` in light; `--gray-950` in dark (dark text on the light red). `danger` buttons use it. New contrast pair `text-on-danger on state-danger >= 4.5`.
- **C5 Home empty lists** use the shared `empty-note` utility instead of `Banner`, matching settings.
- **C6 Auth brand panel**: `--text-on-accent`, with the brand subtitle at 70% and pitch / highlight lines at 90% via `color-mix(in srgb, var(--text-on-accent) N%, transparent)` (same opacities as before).
- **C8 Video overlays** (`RemoteVideoTile.module.css`, `CallStage.module.css` name tags): `rgba(0,0,0,0.6–0.66)` → `--surface-scrim`; `RemoteVideoTile` text moves off the `--gray-0` primitive to `--text-on-accent`.
- **C7 Settings footer** drops its negative margins and own background: it stays inside the card's padding, separated by a `--border-default` top border.

### Size

- **S1–S3**: `Button.module.css` — `.sm` uses `--control-height-sm` for `min-height`; `.iconButton` sets `min-height` and `min-width` as well as `height`/`width`, so size classes can no longer grow it. Header search becomes 32 px (`size="sm"`); the channel-sidebar search `IconButton` becomes 32 px through the `.iconButton` fix alone.
- **S4–S5**: `SettingsSelect` trigger 38 px, `--radius-sm`, `--font-size-base`. The native member `<select>` is replaced by `SettingsSelect`.
- **S6**: add-friend input radius `--radius-sm`.
- **S7**: composer input `--font-size-base`; composer shell radius `--radius-md`; composer controls `--control-height-lg` at every width (the 720 px breakpoint used to shrink them to 40 px).
- **S8**: quick-reaction buttons 32 px (`--control-min-size`), emoji at `--font-size-base`.
- **S9**: member rows share one fixed height (avatar 32 px + `--space-1` padding each side = 40 px); a subtitle no longer adds a pixel.
- **S10**: radii → tokens (see C2); switch row `min-height` → `--control-height-lg` (two-line rows keep their natural height).
- **S11** other near-control literals → tokens: thread composer input/button, utility panel input, call "Join" button, settings footer / compact / secondary / role-create buttons (36–40 px) → `--control-height-md`; settings check rows → `--control-min-size`; emoji picker buttons → `--control-height-sm`. The native `<select>` in the roles permission preview keeps its element but already matched the input styling; its height becomes `--control-height-md`.

### Typography mapping

| From                                                                                                                                                                               | To                                             | Rationale                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `11px`, `12px`, `14px`, `18px`, `22px`, `28px` literals                                                                                                                            | matching `--font-size-*` token                 | same pixels, token instead of literal                 |
| `10px` (hover timestamp)                                                                                                                                                           | `--font-size-xs` (11)                          | smallest step on the scale                            |
| `13px` on names / primary labels (`requestName`, `messageAuthor`, `commandOption strong`, `notificationText strong`, `searchResultsHeader strong`, `checkRow`, `miniCheck`)        | `--font-size-base` (14)                        | primary text in a row                                 |
| `13px` on meta / secondary text (`composerReply`, `pendingFile`, `searchEmpty`, `searchResultSnippet`, `threadPreview`, `loadMoreButton`, `videoAttachment span`, `banner button`) | `--font-size-sm` (12)                          | secondary text                                        |
| `0.875rem` (reply preview)                                                                                                                                                         | `--font-size-sm`                               | secondary text                                        |
| `0.95rem` (composer), `16px` channel intro text                                                                                                                                    | `--font-size-base`                             | body text                                             |
| `15px` settings headings, `16px` DM header name, `1rem` message author                                                                                                             | `--font-size-base` + `--font-weight-semibold`  | row/section titles; matches `ChatHeader` channel name |
| `20px` DM title and empty-state titles                                                                                                                                             | `--font-size-xl` (22)                          | page-level title                                      |
| `30px` channel intro title                                                                                                                                                         | `--font-size-2xl` (28)                         | largest step                                          |
| Avatar initials (`13px`, `16px`, `24px`)                                                                                                                                           | component-local custom property in that module | scales with that avatar only; not a shared token      |

Visible effect: message author names go from 16 px to 14 px semibold (same size as message text, bolder); a few list names grow from 13 to 14 px; a few meta lines shrink from 13 to 12 px.

### Enforcement

`scripts/ui-static-scan.mjs` gains two rules for `apps/web/src/**/*.module.css`:

- `colour literal in component module`: `#hex`, `rgb(`, `rgba(`, `hsl(`, or `white`/`black` as a value.
- `font-size literal in component module`: a `font-size:` whose value is not `var(...)`.

Both rules skip component-local custom property declarations (`--avatar-initials-size: 16px`) and CSS comments. `docs/design-rules.md` states both rules under "Anti-patterns" (it already requires them in prose).

Not enforced yet: primitive token references from components. `AttachmentPreviewDialog.module.css:12` uses `--gray-950` for the media viewer backdrop, which is intentionally dark in both themes; it is left as is.

## Technical Approach

- **Files**:
  - `apps/web/src/styles/tokens.css` — `--text-on-danger` (both themes) and its contrast pair.
  - `apps/web/src/components/ui/Button.module.css`, `SelectionControls.module.css`.
  - `apps/web/src/components/workspace/ServerRail.tsx`, `ServerRail.module.css`.
  - `apps/web/src/components/chat/ChatHeader.tsx`, `MessageComposer.module.css`, `MessageRow.module.css`, `MessageList.module.css`, `UtilityPanel.module.css`, `ThreadPanel.module.css`, `CallStage.module.css`.
  - `apps/web/src/components/SettingsModal.module.css`, `settings/ChannelSettings.tsx`.
  - `apps/web/src/components/home/HomePanel.module.css`, `home/FriendsList.tsx`, `home/ConversationList.tsx` (empty-list markup).
  - `apps/web/src/components/RemoteVideoTile.module.css`.
  - `apps/web/src/components/MemberSidebar.module.css`, `AuthScreen.module.css`.
  - `scripts/ui-static-scan.mjs`, `docs/design-rules.md`.
- **API / DB**: none.
- **Libraries**: none.

## Trade-offs

- **Map to the existing type scale vs add a 13 px / 16 px token**:
  - _Chosen_: map to the existing scale.
  - _Rationale_: the scale was designed with six steps; 13/15/16 px values were drift, not intent (they appear in only some modules, and the same role uses different sizes across screens).
  - _Cost_: small visible size changes listed above.
  - _Rejected_: new `--font-size-md: 13px` — cements the drift and makes "which size?" ambiguous again.
- **Dark text on danger in dark theme vs darker red button**:
  - _Chosen_: `--text-on-danger` token.
  - _Rationale_: keeps `--state-danger` readable as text on dark surfaces (it is used for error messages), and fixes the button without a second red.
  - _Rejected_: switching dark `--state-danger` to `--red-600` — error text on dark surfaces would fail 4.5:1.
- **`color-mix` for the success tint vs a new `--state-success-subtle` token**: one component uses it; `design-rules.md` says single-use values are not tokens. `color-mix` is already used in the codebase and supported by all evergreen browsers.
- **Enforce in the scan vs rely on review**: the rules already existed in prose and drifted; a failing check is the only thing that has held so far (contrast).

## Risks & Rollback

- **Visual regressions** on screens not in the checklist (thread panel, call stage, roles editor). Mitigated by covering those modules in the same grep-driven pass and screenshotting them.
- **Scan false positives** (e.g. a colour inside a comment). Mitigated by stripping CSS comments before matching.
- **Switch semantics**: anyone used to the inverted colours sees a change; the new state is the correct one.
- **Rollback**: CSS / markup only; revert the commit.

## Test Plan

- **Automated**:
  - `npm run ui:scan` (new rules + new contrast pair), `npm run typecheck`, `npm run lint`, `npm run test --workspace apps/web`, `npm run build --workspace apps/web`, `npm run check:file-size`.
  - Existing primitive tests (`components/ui/primitives.test.tsx`) keep passing.
- **Manual / scripted** (headless Chrome, both themes, 1440 px and 390 px): re-measure every control on the screens in the acceptance criteria and confirm heights are only 32 / 38 / 44 px, one active rail button, switch off/on colours, settings cards readable in light; compare before/after screenshots.

## Deployment Notes

- Frontend only; no env, migration, or API change.
