# Feature Spec: Internationalization (English and Vietnamese)

Every user-facing string in the web client, transactional email, push notification, and API error response is resolved from a locale catalog instead of being hardcoded in English.

## Goal

A user picks English or Vietnamese once; the web UI, the emails they receive, the push notifications they get, and the error messages the API returns all follow that choice.

Acceptance criteria:

- `en` and `vi` are both complete: every key present in `en` exists in `vi`, enforced by a type and by `npm run i18n:check`.
- Switching locale in Settings and saving changes the UI without a page reload, and survives a reload and a re-login.
- Verification and password-reset emails arrive in the recipient's stored locale.
- Push notification title and body use the recipient's stored locale.
- API error responses carry a stable `code` and a `message` already translated to the request's locale.
- `npm run i18n:check` fails on a user-facing string literal added to `apps/web/src` outside the catalog, and on a key missing from any locale.
- Dates and times render with the active locale instead of the hardcoded `'en'` at `apps/web/src/helpers.ts:66`, `:91`, and `:109`.

## Scope

- **In scope**: locale mechanism in `packages/shared`, web catalog and provider, server catalog for email and push, translated error envelope, `User.locale` persistence, locale picker in Settings, `Intl` formatting by locale, the `i18n:check` scan script.
- **Out of scope**: right-to-left layouts, per-server locale, translating user-generated content, message auto-translation, locale-aware sorting of member lists, a third locale, translating `docs/` or `README.md`, and `class-validator` field messages (see Trade-offs).

## Current Behavior

- Neither workspace depends on an i18n library (`apps/web/package.json`, `apps/api/package.json`); nothing in the repository references `i18n` or `locale` as a translation concept.
- All web copy is inline JSX text or string literals across 74 `.tsx` files (about 15,400 lines under `apps/web/src`), for example the permission labels at `apps/web/src/helpers.ts:6-19` and the member actions at `apps/web/src/components/MemberSidebar.tsx:181-186`.
- Dates are formatted with a hardcoded `'en'` locale (`apps/web/src/helpers.ts:66`, `:91`, `:109`) and with `toLocaleString()` on the browser locale in seven other places, so the app is already inconsistent about which locale it uses.
- Email subject, text, and HTML bodies are English literals (`apps/api/src/modules/auth/email.service.ts:29-31`, `:54-56`).
- Push notification title and body are built from English format strings (`apps/api/src/modules/push/push.service.ts:71-72`).
- The API throws Nest exceptions with English literal messages at 143 call sites across `apps/api/src`; the web client rethrows `error.message` verbatim (`apps/web/src/api.ts:347-348`) and renders it, so the server literal is what the user reads.
- `User` has no locale column (`apps/api/prisma/schema.prisma`).
- `appContexts.tsx` already carries a `ThemeProvider` with the same shape a locale provider needs (`apps/web/src/contexts/appContexts.tsx:31-33`).

## Changes

### Rules

- Supported locales are `en` and `vi`. `en` is the fallback and the source of truth for the key set.
- Locale resolution order for an API request: validated `X-Locale` header → `User.locale` → `Accept-Language` → `en`.
- Locale resolution for email and push, which have no request context: `User.locale` → `en`.
- Locale resolution in the web client before login: `localStorage` key `discord-clone-locale` → `navigator.language` prefix → `en`.
- A missing key renders the `en` value, and in development logs a warning once per key. It never renders the raw key to the user.
- Interpolation uses named placeholders (`{count}`, `{name}`) and escapes nothing itself; the caller passes already-safe values. Email HTML interpolation escapes on the way in.
- Pluralization uses `Intl.PluralRules` with `one`/`other` forms; `vi` has a single form and both entries may be identical.
- Error responses gain `code`; `message` stays present and becomes the translated text. The shape is otherwise unchanged, so existing clients keep working.

### Client

- `LocaleProvider` lives in `apps/web/src/i18n/LocaleProvider.tsx` and wraps `AppShell` in `App.tsx`, above the auth gate, so the sign-in screen is translated too. It mirrors the shape of `ThemeProvider` in `appContexts.tsx` and exposes `locale`, `setLocale`, and `t`.
- `useTranslation()` returns `t(key, vars?)` with the key type checked against the `en` catalog.
- `useSyncAccountLocale(auth?.user.locale)` in `AppShell` adopts the account's stored locale after sign-in, so a new device follows the account rather than the browser.
- Every user-facing literal in `apps/web/src` moves into `apps/web/src/i18n/locales/en.ts` and `vi.ts`. Keys are namespaced by surface: `chat.composer.placeholder`, `settings.profile.bioLabel`, `error.network.generic`.
- `PERMISSION_OPTIONS` (`apps/web/src/helpers.ts:6-19`) becomes `PERMISSION_VALUES`, a `const` tuple of the values; consumers translate `permission.<VALUE>`. `buildRolePermissionPreview` and `buildMemberPermissionPreview` take the translator as their last argument.
- `formatTime`, `formatDate`, and `formatDayDivider` move out of `helpers.ts` into `src/i18n/useDateFormat.ts` as `useDateFormat()`, bound to the active locale; the bare `toLocaleString()` call sites use it too, so the whole app formats consistently.
- Settings gains a "Language" row next to the existing theme control in `apps/web/src/components/settings/ProfileSettings.tsx`, reusing `SettingsSelect`. It follows the pattern the theme row already uses: the select is a form field, and "Save changes" applies it — `updateProfile` sends `locale` in the same `PATCH /users/me` call and then updates the provider. Applying it immediately on change would leave the UI in a language the account has not stored, so the two can disagree until the next reload.
- Every API request sends `X-Locale: <active locale>` from the shared fetch wrapper in `apps/web/src/api.ts`.
- `apiRequest` throws `ApiError` (message, `code`, HTTP status) instead of a bare `Error`, so a caller that needs to branch on a specific failure uses `code` rather than matching translated text. Upload failures keep their `(file name, type)` suffix.
- The ~70 `err instanceof Error ? err.message : '<fallback>'` fallbacks in the hooks resolve from the catalog under `error.fallback.*` instead of English literals.

### Server

- `I18nService` resolves a locale and returns `t(locale, key, vars)` from `apps/api/src/common/i18n/locales/{en,vi}.ts`.
- `EmailService` looks up the recipient's locale and renders subject, text, and HTML from the catalog.
- `PushService` renders title and body from the catalog using the subscription owner's locale.
- A global `HttpExceptionFilter` maps the thrown English message to an error code through `ERROR_MESSAGE_CODES`, translates it for the request locale, and returns `{ statusCode, code, message }`. The 143 throw sites are not edited.

## Technical Approach

### Data model

```prisma
model User {
  // ...existing fields
  locale String? // 'en' | 'vi'; null means "not chosen yet", resolved per request
}
```

Migration `20260916001000_add_user_locale`. Additive and nullable, so no backfill and no lock concern on a populated table.

### Shared package

`packages/shared/src/i18n.ts` exports the mechanism only, not the copy. The API cannot import it:
the shared package is ESM-only (`packages/shared/package.json` `"type": "module"`) while the API
builds to CommonJS, which is why no API file imports `@discord-clone/shared` today. The API keeps a
mirror at `apps/api/src/common/i18n/locale.ts`, the same arrangement the repository already uses for
`apps/api/src/modules/permissions/channel-permission.ts` and `packages/shared/src/permissions.ts`.
A change to one must land in the other; the file says so in a comment.

- `type Locale = 'en' | 'vi'`, `const locales`, `const defaultLocale`.
- `parseLocale(value: string | null | undefined): Locale | null` — used by the header, the column, and `Accept-Language` parsing.
- `type Catalog<K extends string> = Record<Locale, Record<K, string>>`.
- `translate(catalog, locale, key, vars?)` — placeholder substitution and `en` fallback.
The error-code map lives on the API side only, at `apps/api/src/common/i18n/error-codes.ts`, because
nothing in the client needs it: the filter returns both the code and the already-translated message.

Each app owns its own copy catalog so the web bundle never ships email or push text.

### API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `PATCH` | `/users/me` | existing fields plus `locale?: 'en' \| 'vi'` | `{ user }` including `locale` |

`GET /users/me` adds `locale` to its select (`apps/api/src/modules/users/users.service.ts:12-23`). `UpdateMeDto` gains `@IsOptional() @IsIn(['en','vi']) locale?: Locale` (`apps/api/src/modules/users/dto/update-me.dto.ts`).

Error envelope, from the new filter:

```json
{ "statusCode": 409, "code": "EMAIL_OR_USERNAME_TAKEN", "message": "Email hoặc tên đăng nhập đã tồn tại" }
```

`code` is `null` when the thrown message is not in the map, and the original message passes through
untouched. DTO validation failures keep their array `message` and carry `code: "VALIDATION_FAILED"`.
An unexpected (non-`HttpException`) error returns `code: "INTERNAL_ERROR"` with a translated generic
message; the stack trace stays in the server log.

### Files

- Shared: `packages/shared/src/i18n.ts`, `index.ts`.
- API: `common/i18n/locale.ts` (mirror of the shared module), `common/i18n/i18n.service.ts`, `common/i18n/i18n.module.ts`, `common/i18n/locales/en.ts`, `locales/vi.ts`, `common/i18n/error-codes.ts`, `common/http-exception.filter.ts`, `common/request-user.ts`, `main.ts`, `app.module.ts`, `modules/users/users.service.ts`, `modules/users/dto/update-me.dto.ts`, `modules/auth/email.service.ts`, `modules/auth/auth.service.ts`, `modules/auth/auth.controller.ts`, `modules/auth/jwt-auth.guard.ts` (it already loads the user, so `locale` costs no extra query), `modules/auth/password-reset.service.ts`, `modules/push/push.service.ts`, `prisma/schema.prisma`.
- Web: `src/i18n/locales/en.ts`, `vi.ts`, `src/i18n/LocaleProvider.tsx`, `src/i18n/useDateFormat.ts`, `src/App.tsx`, `src/AppShell.tsx`, `src/api.ts`, `src/helpers.ts`, `src/utils/permissionPreview.ts`, `src/utils/slashCommands.ts`, `src/utils/executeSlashCommand.ts`, `src/components/settings/ProfileSettings.tsx` (it owns the theme row today), and every component and hook holding user-facing copy.
- Scripts: `scripts/i18n-scan.mjs`, `package.json` (`i18n:check`), `.github/workflows` CI step next to `ui:scan`.

`AppShell.tsx` is 787 lines against the 1000-line limit in `scripts/check-file-size.mjs:4`; replacing literals with `t('...')` calls lengthens lines but not line count, so no split is planned. If it crosses the limit during implementation, the composer and modal wiring moves out — that is a deviation to report, not to do silently.

### Enforcement script

`scripts/i18n-scan.mjs` walks `apps/web/src`, and reports:

- A JSX text node or a `title`/`aria-label`/`placeholder`/`alt` attribute holding a literal with two or more letters and a space, outside `src/i18n/`.
- A key present in `en.ts` but missing from `vi.ts`, or the reverse.
- An unused key, as a warning only.

Allowlist comment `// i18n-ignore` for genuine non-copy such as `'UTC'`.

## Trade-offs

- **Hand-rolled catalog vs. `react-i18next` + `nestjs-i18n`**: the repository already hand-rolls comparable infrastructure — the fixed-window limiter (`apps/api/src/common/fixed-window-limiter.ts`), web-push crypto (`apps/api/src/modules/push/web-push-crypto.ts`), `slugify`. Two locales with no plural complexity, no lazy namespace loading, and no translation-management tooling do not pay for two dependencies and roughly 40 KB of client bundle. Cost: no ICU MessageFormat, no extraction tooling, and pluralization is a hand-written `Intl.PluralRules` helper. If a third locale with richer plural rules is added, revisit.
- **Translating errors in a filter vs. editing 143 throw sites**: the filter keeps this feature to one file on the error path and leaves every service untouched, so the change is reviewable and reversible. Cost: `ERROR_MESSAGE_CODES` is keyed on the exact English literal, so editing a literal without updating the map silently drops that message back to English. Mitigated by having `i18n:check` also verify every map key still appears literally somewhere in `apps/api/src`. The alternative — a typed `AppException(code)` at every site — is the better end state and is a clean follow-up once the map exists, but as a first slice it touches 143 places and hides this feature inside a refactor.
- **`X-Locale` header vs. `Accept-Language` alone**: the browser's `Accept-Language` is not the user's app choice, and a Vietnamese user on an English-locale machine would get English error text. An explicit header makes the choice observable and testable. Cost: one more header, and it must be added to the CORS allowlist.
- **DTO validation messages stay English**: `class-validator` messages live in decorator options across the DTOs (`@Matches(..., { message: '...' })`) and never pass through the error-code map, so the filter forwards their array untouched with `code: "VALIDATION_FAILED"`. Translating them means a `messageKey` convention plus a pipe that resolves it, which is a separate change; the client-side `pattern`/`minLength` attributes already stop most of these before a request is sent. Cost: a user who defeats client validation sees one English sentence.

- **Catalog per app vs. one shared catalog**: per-app keeps email and push copy out of the client bundle and lets each side change copy without rebuilding the other. Cost: the shared error-code map is the one place both sides touch.
- **Nullable `locale` vs. defaulting to `'en'`**: null preserves "follow the browser" for existing users instead of silently pinning everyone to English at migration time.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- The API mirrors the locale primitives instead of importing `@discord-clone/shared`; the shared package is ESM-only and the API is CommonJS. This is the repository's existing arrangement for shared contracts on the API side.
- The locale select applies on "Save changes", like the theme row, rather than optimistically on change.
- `X-Locale` needs no CORS configuration change.
- `class-validator` field messages stay English (see Trade-offs).
- The ~70 non-`Error` fallback strings in the hooks were translated as well; they were not called out in the original scope but are user-facing.

## Risks & Rollback

- **Risk**: an incomplete extraction leaves mixed-language screens. `i18n:check` in CI is what keeps this from recurring in later waves, which is why this feature is first in the wave.
- **Risk**: the error-code map drifts from the literals. Covered by the map-key check above; a drifted entry degrades to English, never to a crash or a raw key.
- **Risk**: the diff touches nearly every web component, so it conflicts with any concurrent UI work. Land it in one slice and pause other UI branches.
- **Risk**: a translated error message changes what the client compares against if anything matches on message text. Grep before implementing; `code` is the supported way to branch.
- **Rollback**: revert the code; the migration is additive and a leftover `locale` column is harmless.

## Test Plan

Automated tests are not kept in this repository (see `RULE.md`). Verification is `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:file-size`, `npm run docs:check`, `npm run ui:scan`, `npm run i18n:check`, plus:

- **Manual**: sign in, Settings → Language → Tiếng Việt → Save changes → the shell, channel sidebar, composer, and member sidebar switch without reload → reload, still Vietnamese → sign out and back in, still Vietnamese.
- **Manual**: with the locale on Vietnamese, submit a registration using an existing email → the conflict message renders in Vietnamese.
- **Manual**: request a password reset for a user whose `locale` is `vi` → the email subject and body are Vietnamese; for a user with `locale` null → English.
- **Manual**: with push enabled and `locale` `vi`, receive a channel mention → the notification title and body are Vietnamese.
- **Manual**: a message timestamp and the sessions list render Vietnamese date formatting.
- **Failure case**: send `X-Locale: fr` → the API answers in the user's stored locale, not an error.

## Deployment Notes

- Run migration `20260916001000_add_user_locale` before deploying the API.
- No CORS change is needed: `app.enableCors` in `main.ts` sets no `allowedHeaders`, so the `cors` middleware reflects `Access-Control-Request-Headers` and `X-Locale` passes. If `allowedHeaders` is ever pinned, `X-Locale` must be added to it.
- Deploy API before web: the web sends `X-Locale` and reads `user.locale`, both of which an older API ignores safely, but an older web against the new API is also fine. No coordinated release needed.
- Add `npm run i18n:check` to CI next to `npm run ui:scan`.
