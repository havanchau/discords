# Code Style

How code in this repository is written. Each rule names the tool that enforces it, or points at code
that already follows it. UI rules are not repeated here: they live in [design-rules.md](design-rules.md),
with token values in `apps/web/src/styles/tokens.css`. Product rules live in `RULE.md`.

## Tooling

| Command                   | Enforces                                                             | In CI |
| ------------------------- | -------------------------------------------------------------------- | ----- |
| `npm run format:check`    | Prettier (`.prettierrc.json`, `.prettierignore`)                     | yes   |
| `npm run lint`            | ESLint, zero warnings; builds `packages/shared` first                | yes   |
| `npm run typecheck`       | `tsc --noEmit` for every workspace, `strict: true`                   | yes   |
| `npm run check:file-size` | No source file over 1000 lines                                       | yes   |
| `npm run i18n:check`      | Copy goes through the locale catalogs; API error literals are mapped | yes   |
| `npm run ui:scan`         | Design tokens and contrast                                           | yes   |
| `npm run docs:check`      | Markdown structure ([markdown-structure.md](markdown-structure.md))  | yes   |

Run `npm run format` before committing; CI does not fix formatting, it only fails on it.

ESLint (`eslint.config.mjs`) applies, beyond the recommended presets:

- `typescript-eslint` **type-checked** rules on every `.ts`/`.tsx` file — unhandled promises, async
  functions passed where a `void` callback is expected, `any` flowing into typed code.
- `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` in `apps/web`.
- `no-console` in `apps/*/src` and `packages/shared/src`. Scripts in `scripts/` may log.
- `no-restricted-imports` for `../` in `apps/*/src` (see [Imports](#imports)).

Do not silence a rule to get a green run. When a rule is genuinely wrong for one line, use
`// eslint-disable-next-line <rule> -- <reason>`; a bare disable without a reason is not accepted.

## TypeScript

- No `any` and no `@ts-ignore`. Data from outside the program (`JSON.parse`, `response.json()`,
  `socket.data`, `FormData`) is `unknown` until narrowed — see `readErrorBody` in
  `apps/web/src/api.ts` and `readSocketUser` in `apps/api/src/modules/realtime/socket-user.ts:15`.
- Request/response and realtime payload types live in `packages/shared` and are imported from
  `@discord-clone/shared`; never redeclare them in an app.
- Read form fields with `formText` (`apps/web/src/utils/formText.ts`), not `String(form.get(...))`,
  which turns a file input into `"[object File]"`.

## Naming and layout

| Where                     | Files                                                          | Example                                      |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `apps/api/src`            | kebab-case, suffixed by role                                   | `friends.controller.ts`, `create-ban.dto.ts` |
| `apps/web/src/components` | PascalCase component, sibling `.module.css` with the same name | `MessageRow.tsx` + `MessageRow.module.css`   |
| `apps/web/src/hooks`      | camelCase, `use` prefix                                        | `useThreadPanel.ts`                          |
| `apps/web/src/utils`      | camelCase, one concern per file                                | `channelCategories.ts`                       |

**API module** (`apps/api/src/modules/<domain>/`): `<domain>.module.ts`, `<domain>.controller.ts`,
`<domain>.service.ts`, and `dto/` with one class per request body. Code shared by several modules
goes in `apps/api/src/common/`.

**Web** (`apps/web/src/`):

- `components/ui/` — primitives, exported from `components/ui/index.ts`. Use them before a raw element.
- `components/<domain>/` — feature components (`chat/`, `home/`, `settings/`, `workspace/`, …), with
  a local `types.ts` for the props they share.
- `hooks/` — feature hooks; `query/` — React Query client, keys and cache owners; `i18n/` —
  locale provider and catalogs; `utils/` — pure helpers.

## Imports

- Anything outside the current folder is imported through `@/`, which maps to the app's own `src/`
  (`apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/api/tsconfig.json`). Enforced by lint.
- Files in the same folder use `./`.
- Shared contracts come from `@discord-clone/shared`.

```ts
import { apiRequest } from '@/api';
import { Button } from '@/components/ui';
import { MessageRow } from './MessageRow';
```

## API

- **Controllers are thin**: guard, parse the DTO, call the service, return
  (`apps/api/src/modules/friends/friends.controller.ts:11-18`). No Prisma access in controllers or
  gateways.
- **Every request body is a DTO** with `class-validator` decorators
  (`apps/api/src/modules/friends/dto/create-friend-request.dto.ts`); the global `ValidationPipe` is
  configured in `apps/api/src/main.ts:99`.
- **Errors**: throw Nest's HTTP exceptions with an English message.
  `TranslatingExceptionFilter` (`apps/api/src/common/http-exception.filter.ts:21`) uses that literal as
  the key into `common/i18n/error-codes.ts`, so a new or changed message must be added there and to
  both API locale catalogs — `npm run i18n:check` reports a missing one.
- **Logging**: a `Logger` per class (`apps/api/src/modules/realtime/realtime.gateway.ts:40`), never
  `console`. Do not log tokens, passwords or message content.
- **Multi-row writes** go through `prisma.$transaction`
  (`apps/api/src/modules/auth/two-factor.service.ts:112`).
- **Config** is read through `ConfigService`, registered globally in `apps/api/src/app.module.ts:28`.

## Web

- **Server state** belongs to React Query. Keys are built in `apps/web/src/query/queryKeys.ts:5` and
  include every parameter that changes the result. See
  [convention-and-scale-refactor.md](features/convention-and-scale-refactor.md) for what deliberately
  stays in `useState`.
- **Calls to the API** go through `apiRequest` (`apps/web/src/api.ts`), which attaches the token and
  refreshes it; components never call `fetch` directly.
- **Effects that run on an id change but call functions recreated every render** wrap that logic in
  `useEffectEvent`, keeping the id as the only dependency
  (`apps/web/src/components/settings/ServerBansSection.tsx:29`). Do not drop a dependency to stop an
  effect from re-running.
- **Async handlers in JSX** are wrapped so the promise is explicitly ignored:
  `onSubmit={(event) => void submit(event)}`. `void` adds no error handling, so the handler must
  catch and report its own failure.
- **Copy** comes from the locale catalogs via `useTranslation()`; `npm run i18n:check` scans for
  hardcoded text.
- **Styles**: CSS Modules and semantic tokens only — see [design-rules.md](design-rules.md).

## Errors

- No empty `catch`. A caught error is rethrown, shown to the user (for example through
  `setWorkspaceError`), or carries a comment saying why ignoring it is correct
  (`apps/api/src/modules/auth/oauth/oauth.service.ts:183-185`).
- Messages shown to users never include stack traces, SQL or internal ids.

## Commits

`<type>(<scope>): <outcome>` — types `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `style`.
Describe the result, not the activity: `fix(chat): restore Reply action on channel messages`.
