# Feature Spec: Code Convention Tooling

- **Status**: implemented
- **Date**: 2026-09-16
- **Related**: [convention-and-scale-refactor.md](convention-and-scale-refactor.md), [../markdown-structure.md](../markdown-structure.md), [open-questions.md](open-questions.md)

## Goal

The repository documents conventions (`AGENT.md`, `RULE.md`, `docs/design-rules.md`) but only part
of them is enforced by a tool. Formatting has drifted, the lint preset cannot see hook dependency
bugs or unhandled promises, imports climb the tree with `../../`, and there is no single place that
says how code in this repo is written. This change makes the conventions checkable in CI and writes
them down once.

Acceptance criteria:

- [x] `npm run format:check` passes and runs in CI.
- [x] `npm run lint` runs `eslint-plugin-react-hooks` (`rules-of-hooks`, `exhaustive-deps`) and the
      `typescript-eslint` type-checked preset on `apps/**` and `packages/**`, with zero warnings.
- [x] `no-console` is an error in `apps/**/src` and `packages/shared/src`.
- [x] Both apps resolve `@/…` to their own `src/`; no import in `apps/*/src` starts with `../`, and
      lint rejects a new one.
- [x] `npm run typecheck`, `npm run build`, `check:file-size`, `docs:check`, `i18n:check`, `ui:scan`
      still pass; the built API starts and answers `GET /health`.
- [x] `docs/code-style.md` exists, is linked from `AGENT.md` and `docs/README.md`, and every rule in it
      is either enforced by a tool or cites the code that already follows it.

## Scope

**In scope**

1. Prettier: `.prettierignore`, one formatting-only pass over the repo, `format:check` in CI.
2. ESLint: react-hooks plugin, type-checked preset, `no-console`, `no-restricted-imports` for `../`,
   and fixing every violation these rules report.
3. Path alias `@/` for `apps/web` and `apps/api`, and a mechanical rewrite of existing parent imports.
4. `docs/code-style.md` as the canonical code style guide.

**Out of scope**

- Git hooks (husky, lint-staged) and commitlint — they add dependencies and a local install step;
  CI already gates the same checks. See open question 6.
- The React Compiler rules shipped in `eslint-plugin-react-hooks` v6+ (`set-state-in-effect`,
  `refs`, `purity`, …). See open question 7.
- Import sorting (`simple-import-sort` / `import/order`).
- Behavior changes of any kind, including the swallowed error at
  `apps/web/src/hooks/useChatOrchestrator.ts:52` and the "English literal as error key" design in
  `apps/api/src/common/i18n/error-codes.ts:1`. Both are reported, not fixed here.
- Splitting the files close to the 1000-line limit (`AppShell.tsx` 800, `messages.service.ts` 773,
  `useSettingsActions.ts` 757).
- Aliases inside `packages/shared` (it has no deep folders).

## Current behavior

### Formatting

- `.prettierrc.json` exists and `package.json:20-21` defines `format` / `format:check`, but there is no
  `.prettierignore` and CI does not run `format:check` (`.github/workflows/ci.yml:41-49`).
- `prettier --list-different .` reports 160 files: 69 in `apps/web`, 39 in `apps/api`, 34 in `docs`,
  3 in `packages/shared`, 6 in `scripts`, and root/config files. 38 of them are Markdown.

### Lint

- `eslint.config.mjs:6-7` uses `js.configs.recommended` and `tseslint.configs.recommended` only — no
  type information, no React plugin. `no-explicit-any` and `no-unused-vars` are `warn`
  (`eslint.config.mjs:30-38`), made blocking by `--max-warnings 0` (`package.json:18`).
- `eslint-plugin-react-hooks` is not installed.
- Measured with a throwaway script (not committed) running `recommendedTypeChecked` over
  `apps/api/src`, `apps/web/src`, `packages/shared/src`: **103 findings** (82 web, 21 api).

  | Rule                                                                          | Count | Where, mostly                                                                                      |
  | ----------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
  | `no-base-to-string`                                                           | 41    | `String(form.get('x'))` on `FormDataEntryValue`, e.g. `useSettingsActions.ts:200`                  |
  | `no-misused-promises`                                                         | 21    | async handlers passed to JSX `onSubmit`/`onClick`, e.g. `WorkspaceDialogs.tsx`                     |
  | `no-unsafe-member-access` / `-assignment` / `-argument` / `-call` / `-return` | 31    | `apps/web/src/api.ts` response parsing; socket handshake data in `apps/api/src/modules/realtime/*` |
  | others (`await-thenable`, `no-floating-promises`, `require-await`, …)         | 5     | scattered                                                                                          |
  | `no-unused-vars`                                                              | 5     | already covered by the existing `_` ignore pattern; disappears once that override is kept          |

- Lint currently takes ~3 s; the type-checked run took ~10 s.
- The API resolves `@discord-clone/shared` from `packages/shared/dist/index.d.ts`
  (`apps/api/tsconfig.json:13-15`), so type-aware lint of the API needs `build:shared` first. CI runs
  `lint` before `typecheck` (which is where `build:shared` runs today, `package.json:19`).

### Imports

- No alias except `@discord-clone/shared` (`tsconfig.base.json:17-20`, `apps/web/vite.config.ts:9-11`).
- `apps/web/src`: 384 imports start with `../`, 180 of them `../../` or deeper.
- `apps/api/src`: 200 imports start with `../`; 69 of them reach `common/`, and
  `auth/oauth/*` and `users/dto/update-me.dto.ts` go three levels up.
- The API is built by `nest build` with the default `tsc` compiler (`apps/api/nest-cli.json`), and
  `prisma/seed.ts` runs through `tsx` (`apps/api/package.json`).

### Written conventions

- `AGENT.md` and `RULE.md` cover workflow, product rules, realtime and data safety; UI rules live in
  `docs/design-rules.md`. Nothing documents file naming, folder layout, import style, error handling
  or logging, although the code is largely consistent on these (observed: kebab-case files in
  `apps/api`, PascalCase components and camelCase hooks/utils in `apps/web`, `Logger` in 13 API files,
  zero `console.*` in `apps/*/src`).

## Changes

### 1. Prettier

- Add `.prettierignore`: `node_modules`, `dist`, `build`, `coverage`, `package-lock.json`,
  `artifacts/`, `docs/screenshots/`, `apps/api/prisma/migrations/`, `.vercel/`, and the per-machine
  `.claude/settings.local.json`.
- Run `npm run format` once. This diff contains **only** formatting.
- CI: add `npm run format:check` right after `npm ci`, before the DB steps, so it fails fast.
- After this, `npm run docs:check` must still pass (Prettier rewrites Markdown tables and list markers,
  not headings or links).
- **Deviation found while implementing**: `scripts/i18n-scan.mjs` read the API locale catalogs one line
  at a time and required `key: '` on the same line. Prettier moved long values to the next line, so
  `i18n:check` reported two keys as missing. The key regex now also accepts a key alone on its line;
  it reads 107 keys from each catalog, the same count as before formatting.

### 2. ESLint

New `eslint.config.mjs` layout, in order:

1. `js.configs.recommended`.
2. `tseslint.configs.recommendedTypeChecked` for `**/*.{ts,tsx}`, with
   `parserOptions.projectService: true` and `tsconfigRootDir: import.meta.dirname`.
3. `tseslint.configs.disableTypeChecked` for `**/*.{js,mjs,cjs}` and for files no tsconfig includes
   (`apps/api/prisma/seed.ts`).
4. `react-hooks`: `rules-of-hooks: error`, `exhaustive-deps: error`, for `apps/web/**/*.{ts,tsx}`.
5. For `apps/*/src/**` and `packages/shared/src/**`: `no-console: error`, and
   `no-restricted-imports` with pattern `../*` ("use the `@/` alias").
6. The existing `no-unused-vars` (`_` ignore pattern) and `no-explicit-any` overrides, kept last so the
   preset does not replace them.

`scripts/*.mjs` keep using `console` (they are CLI tools) and are outside rule 5.

Violations are **fixed, not suppressed**: the change adds no `eslint-disable` line. Fix patterns,
all behavior-preserving (as implemented — the `exhaustive-deps` and `no-misused-promises` rows changed
from the approved draft, see below):

| Rule                              | Fix                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-base-to-string` on `FormData` | one helper `formText(form, name): string` in `apps/web/src/utils/`, returning `''` for a missing entry or a `File`                                                                                          |
| `no-misused-promises` in JSX      | `onSubmit={(event) => void handleSubmit(event)}`. React already discarded the returned promise, so this changes nothing at runtime; whether each handler catches its own errors was **not** audited here    |
| `no-unsafe-*` on API responses    | `readErrorBody` in `api.ts` narrows the error body from `unknown`; `apiRequest` returns `(await response.json()) as T`, the same contract as before; `vite-env.d.ts` types the three `VITE_*` variables     |
| `no-unsafe-*` on socket handshake | `readSocketUser` / `setSocketUser` in `socket-user.ts` are the only readers of `socket.data`; `handshake.auth.token` is used only when it is a string                                                       |
| `exhaustive-deps`                 | add the missing dependency when that cannot change how often the code runs; otherwise move the effect body into `useEffectEvent` (React 19.2) and keep the dependency array unchanged — see the table below |

**Why `useEffectEvent` instead of a ref**: an effect event reads the props and state of the latest
committed render, which is exactly what the effect body read before, because the effect ran right after
that render. Moving the body into it keeps both _when_ the effect runs (unchanged dependency array) and
_what_ it reads. A ref per value would have needed one extra ref and one sync effect per dependency.

`exhaustive-deps` sites (17):

| Site                                                                                                              | Fix                                    | Runtime effect                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `useAuthSession` URL-token effect, `useOAuthSignIn` code exchange                                                 | add `t`                                | re-runs on a locale change; both are no-ops by then (the URL parameters were removed on the first run)                               |
| `useChatOrchestrator` `togglePinnedMessage`, `toggleReaction`; `useThreadPanel` `openThread`, `sendThreadMessage` | add `t`                                | new callback identity on a locale change only; fallback error messages now use the current locale instead of the one at first render |
| `useTwoFactor` `loadStatus`                                                                                       | add `t`                                | a locale change while 2FA settings are open refetches the status once                                                                |
| `MessageList` layout effect                                                                                       | extract `hasNoMessages`                | none                                                                                                                                 |
| `ChannelSettings` `members`                                                                                       | `useMemo` on `server?.members`         | none                                                                                                                                 |
| `ChatPanel` screen-reader announcement                                                                            | `useEffectEvent`                       | none                                                                                                                                 |
| `ServerBansSection` bans refresh                                                                                  | `useEffectEvent`                       | none                                                                                                                                 |
| `AppShell` account data load, channel open                                                                        | `useEffectEvent`                       | none                                                                                                                                 |
| `useSettingsActions` channel and server settings loads                                                            | `useEffectEvent`                       | none                                                                                                                                 |
| `useChannelCall` WebRTC listeners                                                                                 | `useEffectEvent` returning the cleanup | none                                                                                                                                 |
| `useRealtimeSocket` connection and listeners                                                                      | `useEffectEvent` returning the cleanup | none — listeners still keep the values of the render that connected, as documented at the call site                                  |

Other type changes this required: the `openThread` / `togglePinnedMessage` options of
`useChannelMessageActions` and `ChatPanelChannelAvatar.update` are now typed as returning
`Promise<void>` (which they always did), and are wrapped with `void` where they are handed to a `void`
slot. `main.ts` creates the app as `NestExpressApplication`, so `app.set('trust proxy', …)` replaces the
untyped `getHttpAdapter().getInstance().set(…)` — the same Express call. The Cloudinary upload rejects
with `new Error('Cloudinary upload failed', { cause })`, which is the message the client already got.

`formText` returns `''` for a missing field. For `email` and `password` in `useAuthSession`, which used
`String(form.get(…))` without a fallback, a missing field previously sent the string `"null"`; those
fields are always rendered, so this is not reachable from the UI.

CI and scripts: `lint` becomes `npm run build:shared && eslint . --max-warnings 0`, so the API's typed
lint never sees a stale or missing `dist`.

New dev dependency: `eslint-plugin-react-hooks` `7.1.1`, pinned exactly like the rest of
`package.json`, added at the root (the ESLint config is root-level). Its lockfile entry is 344 lines,
because v7 bundles a Babel-based compiler analysis.

### 3. Path alias

- `apps/web/tsconfig.json`: `paths` gets `"@/*": ["apps/web/src/*"]`. Because `paths` replaces the
  base value rather than merging, the two `@discord-clone/shared` entries from `tsconfig.base.json` are
  restated there. **Deviation**: the targets are relative to the repo root, not `./src/*`, because
  `baseUrl` is inherited from `tsconfig.base.json` and resolves to the repo root
  (`tsc --showConfig` prints `"baseUrl": "../.."`). Overriding `baseUrl` per app was avoided: it is
  deprecated in TypeScript 6 and would also change how every bare specifier resolves.
- `apps/web/vite.config.ts`: `resolve.alias['@']` → `path.resolve(__dirname, 'src')`.
- `apps/api/tsconfig.json`: `"@/*": ["apps/api/src/*"]` added next to the existing shared entry.
- API runtime: `nest build` rewrites `paths` aliases in the emitted JS through the Nest CLI's
  tsconfig-paths hook (`@nestjs/cli/lib/compiler/hooks/tsconfig-paths.hook.js`). Verified: `dist/`
  contains no `require("@/…")`, and the built API starts and answers `/health`.
- Noticed, not changed: for the same `baseUrl` reason, the existing API entry
  `"@discord-clone/shared": ["../../packages/shared/dist/index.d.ts"]` points outside the repo, so the
  API most likely resolves the package through `node_modules` instead (**inferred, not verified**).
- Rewrite rule, applied by a throwaway codemod (not committed): an import whose specifier starts with
  `../` becomes `@/<path relative to src>`. Same-folder `./x` imports stay relative. Nothing else on
  the line changes. It rewrote 592 imports in 194 files.

### 4. `docs/code-style.md`

A new owner doc (the content fits no existing owner in `docs/markdown-structure.md`), linked from
`AGENT.md` Operating Rules and the `docs/README.md` Files table. Sections:

- **Tooling** — what Prettier, ESLint and each CI check enforce, and which command to run.
- **TypeScript** — no `any`, `unknown` + narrowing at boundaries, shared contracts from
  `packages/shared` only.
- **Naming and layout** — file naming per app; API module layout (`module/controller/service/dto`);
  web layout (`components/<domain>/`, `components/ui/`, `hooks/`, `query/`, `utils/`, `i18n/`).
- **Imports** — `@/` for anything outside the current folder; `@discord-clone/shared` for contracts.
- **API** — thin controllers, DTO validation, exceptions and how `TranslatingExceptionFilter`
  translates them, `Logger` not `console`, transactions for multi-row writes.
- **Web** — server state in React Query (`query/queryKeys.ts`), UI state in hooks, CSS Modules +
  tokens (links to `design-rules.md`, not a copy).
- **Errors** — no empty `catch`; a caught error is rethrown, reported to the user, or has a comment
  saying why ignoring it is correct.
- **Commits** — `<type>(<scope>): <outcome>`.

Every rule cites either the tool that enforces it or a `file:line` that already follows it. UI
rules are linked, never restated.

## Technical approach

**Files touched**

| File                                                                          | Change                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `.prettierignore`                                                             | new                                                                          |
| ~160 files across the repo                                                    | formatting only                                                              |
| `.github/workflows/ci.yml`                                                    | add `format:check`                                                           |
| `package.json`, `package-lock.json`                                           | `eslint-plugin-react-hooks` dev dependency; `lint` runs `build:shared` first |
| `eslint.config.mjs`                                                           | layout above                                                                 |
| ~30 files in `apps/web/src`, ~10 in `apps/api/src`                            | lint fixes                                                                   |
| `apps/web/src/utils/formText.ts`, `apps/web/src/vite-env.d.ts`                | new                                                                          |
| `scripts/i18n-scan.mjs`                                                       | catalog key regex tolerates wrapped values                                   |
| `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/api/tsconfig.json` | `@/` alias                                                                   |
| 194 files in `apps/*/src`                                                     | import rewrite                                                               |
| `docs/code-style.md`                                                          | new                                                                          |
| `AGENT.md`, `docs/README.md`                                                  | links to the new doc and this spec                                           |

**Suggested commit split** (commits are made only when you ask): formatting pass alone first, so it can
be listed in `.git-blame-ignore-revs`; then CI + ESLint + fixes; then alias + rewrite; then docs.

## Trade-offs

| Option                                              | Pros                                                                                | Cons                                                                           | Verdict                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **One repo-wide format pass (chosen)**              | CI can gate from day one; one commit to ignore in blame                             | 160-file diff; conflicts for any open branch                                   | chosen: the branch is fresh and there is no open PR in the log                                       |
| Format only touched files over time                 | no big diff                                                                         | `format:check` cannot run in CI until done; drift continues                    | ruled out                                                                                            |
| **`recommendedTypeChecked` (chosen)**               | catches unhandled promises and unsafe `any` flows, which matter for socket handlers | ~3× lint time (3 s → 10 s); 103 fixes; lint depends on `build:shared`          | chosen: 10 s is acceptable, and the findings are real (e.g. `String(File)` yields `"[object File]"`) |
| `strictTypeChecked`                                 | stricter                                                                            | many more findings, several stylistic                                          | ruled out for now                                                                                    |
| Only `no-floating-promises` + `no-misused-promises` | small diff                                                                          | misses `no-unsafe-*` at the API boundary                                       | ruled out                                                                                            |
| **react-hooks core rules only (chosen)**            | `exhaustive-deps` is the main hook bug source                                       | Compiler rules left for later                                                  | chosen: Compiler rules push toward refactors, which is out of scope                                  |
| **`@/` for both apps (chosen)**                     | one convention to learn; editor picks the nearest tsconfig, so no clash             | a grep for `@/common` must be scoped to the app                                | chosen                                                                                               |
| `@web/`, `@api/` distinct prefixes                  | unambiguous across apps                                                             | longer, and the two apps never import each other anyway                        | ruled out                                                                                            |
| **Rewrite all imports now (chosen)**                | consistent; lint can forbid `../` immediately                                       | ~580 import lines changed                                                      | chosen: mechanical and verified by typecheck + build                                                 |
| Alias for new code only                             | tiny diff                                                                           | two styles indefinitely; lint cannot enforce                                   | ruled out                                                                                            |
| **Style guide in `docs/code-style.md` (chosen)**    | follows the repo's own doc ownership rules; readable by humans and every agent      | one more file to keep current                                                  | chosen                                                                                               |
| `.claude/rules/code-style.md`                       | auto-read by Claude Code                                                            | invisible to Codex/humans; `docs/markdown-structure.md` puts guides in `docs/` | ruled out; `AGENT.md` links to the doc instead                                                       |

What the chosen option costs: slower lint, a large one-time diff that will conflict with any branch
cut before it, and a lint that now needs the shared package built.

## Risks & rollback

- **Alias at API runtime** — if a future build switches away from the Nest CLI compiler (e.g. plain
  `tsc` or `swc` without the paths plugin), `node dist/main.js` fails with `Cannot find module '@/…'`.
  CI's smoke step starts the built API and would catch it.
- **`exhaustive-deps` fixes** — the only runtime differences are the locale-change ones listed in the
  table above. The `useEffectEvent` sites rely on React's documented semantics; they were exercised in
  the browser for load, idle and channel switching only (see Test plan).
- **Prettier on Markdown** may reflow content in ways `docs:check` does not catch (e.g. long tables).
  Reviewed in the diff.
- **Merge conflicts** for any branch cut before the formatting commit.
- **Not covered**: no automated tests (`RULE.md` forbids them); behavior is checked manually below.
- **Rollback**: each step is its own commit and reverts independently. No data, schema, env or API
  change is involved.

## Test plan

**Automated** — no test files (`RULE.md`). All checks below were run on the final tree and pass:

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run check:file-size`, `npm run docs:check`, `npm run i18n:check`, `npm run ui:scan`.
- `git diff --stat` after the format pass shows no file outside the Prettier scope.
- `grep -rE "from '\.\./" apps/*/src` returns nothing after the rewrite.

**Manual — planned**

1. Build and start the API (`npm run build`, `npm run start --workspace apps/api`); `GET /health`
   returns 200 — proves aliases resolve at runtime.
2. `npm run dev`, log in, open a server, send a message in a channel and in a DM; zero console errors.
3. For each form touched by `formText` (invite creation, server event form, category edit, settings
   profile/theme/locale): submit with a value and with the field empty; the saved result matches the
   pre-change behavior.
4. For each `exhaustive-deps` site listed in this doc: exercise the feature and confirm the effect does
   not re-run in a loop (network tab: no repeated requests; socket: one subscription).
5. Failure case: add `import x from '../x'` in a web file and run `npm run lint` — it fails with the
   alias message. Revert.
6. `npm run ui:smoke` against the local API and web preview returns `ok: true`.

**Results**

- Automated: all eight scripts pass. `grep` finds no `from '../` in `apps/*/src`; the only remaining
  `../` string is the `.env` path in `apps/api/src/app.module.ts:28`, which is not an import.
- Step 1: the built API started against the local Postgres and Redis containers; `GET /health` returned
  `200 {"status":"ok","services":{"api":"ok","database":"ok"}}`.
- Step 5: an injected `import … from '../api'` in `hooks/useMediaQuery.ts` fails lint with the alias
  message (linted through stdin; no file was written).
- Step 6: `ui:smoke` returned `ok: true` — it creates a channel (dialog form), uploads a file, sends,
  reacts, replies, starts a call and opens search.
- Steps 2 and 4, partially: a throwaway Puppeteer script (not committed) logged in, waited, then
  switched channels. Zero console errors and page errors; zero requests during 5 s idle after load (no
  effect loop); switching to another channel fetched its messages exactly once.

**Not verified**

- Step 3: the `formText` forms other than channel creation (invite, server event, category edit,
  profile/theme/locale settings, 2FA, sign-up/reset) were not submitted in a browser.
- DMs, a second user's socket events, a real WebRTC peer, and switching the locale at runtime (the
  `t` dependency sites).

## Deployment notes

- No env vars, no migration, no API change.
- CI: `format:check` is a new gate, and `lint` now builds `packages/shared` first.
- Open branches must rebase onto the formatting commit, then run `npm run format`.
- After the formatting commit lands, add its hash to `.git-blame-ignore-revs` (optional, separate
  change).
