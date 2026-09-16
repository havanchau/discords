# Feature Spec: Google and Facebook Sign-in

Sign in or create an account with Google or Facebook from the auth screen, using the OAuth 2.0
authorization code flow with PKCE.

## Goal

A user can press **Google** or **Facebook** on the auth screen, approve access at the provider, and land
signed in — creating an account on first use.

Acceptance criteria:

- The Google and Facebook buttons are enabled only when that provider is configured on the API; otherwise
  they stay disabled with "not configured".
- First sign-in with a provider creates a verified account; later sign-ins reuse it.
- Signing in with a provider whose email matches an existing account follows the linking rules below and
  never lets someone take over an account they do not own.
- A user with two-factor authentication enabled must still pass the 2FA step.
- No access token, refresh token, or provider token ever appears in a URL.
- A forged or replayed callback (bad `state`, reused code) is rejected.

## Scope

- **In scope**: Google and Facebook sign-in and sign-up, account linking by email, 2FA handoff, auth
  screen buttons and callback handling, configuration and deployment notes.
- **Out of scope**: linking/unlinking providers from settings, importing provider avatars, other providers
  (GitHub, Apple, Discord), provider sign-in inside the mobile/PWA shell, using provider tokens to call
  Google or Facebook APIs later.

## Current Behavior

- The auth screen renders disabled **Google** and **Facebook** buttons with the title
  "… sign-in is not configured" (`apps/web/src/components/AuthScreen.tsx:268-275`).
- Accounts are created only through `POST /auth/register` with a password; `User.passwordHash` is
  required (`apps/api/prisma/schema.prisma:40`), and login requires `emailVerifiedAt`
  (`apps/api/src/modules/auth/auth.service.ts`).
- Sessions are issued by `AuthService.createSession`; 2FA is handed off with a signed challenge token from
  `TwoFactorChallengeService` and completed at `POST /auth/2fa/verify-login`.
- Disabling 2FA asks for the account password; enabling only asks for an authenticator code
  (`two-factor.service.ts:133-146`).
- `@nestjs/passport` and `passport` are installed (used for JWT); no OAuth strategy packages are.
- The web client talks to the API through `API_URL` (`/api` proxied by Vite in development,
  `VITE_API_URL` in production) (`apps/web/src/api.ts:1-3`).

## Changes

### Flow

1. **Start** — the button does a full-page navigation to `GET {API_URL}/auth/oauth/:provider`.
   The API creates a random `state` and a PKCE `code_verifier`, stores both in an httpOnly cookie
   (`oauth_flow`, `SameSite=Lax`, `Secure` in production, path `/`, 10 minutes), and redirects to
   the provider's consent page with `state`, the PKCE `code_challenge` (S256), and the minimal scopes:
   - Google: `openid email profile`
   - Facebook: `email public_profile`
2. **Callback** — the provider redirects to `GET {OAUTH_REDIRECT_BASE_URL}/auth/oauth/:provider/callback`.
   The API:
   - rejects the request unless `state` matches the cookie, then clears the cookie either way;
   - exchanges `code` + `code_verifier` for an access token (server-to-server, 10 s timeout, no retry);
   - fetches the profile: Google `openidconnect.googleapis.com/v1/userinfo` (`sub`, `email`,
     `email_verified`, `name`); Facebook Graph `/me?fields=id,name,email`;
   - resolves the user (rules below);
   - creates a one-time **login code** (32 random bytes, stored as SHA-256, valid 60 s, single use) and
     redirects to `{web origin}/?oauthCode=…`.
3. **Exchange** — the web app reads the code, removes it from the address bar, and calls
   `POST /auth/oauth/exchange { code }`. The API claims the code atomically and returns exactly what
   `POST /auth/login` returns: a session, or `{ twoFactorRequired, challengeToken, expiresIn }`.
4. **Errors** — any failure in step 2 redirects to `{web origin}/?oauthError=<reason>` with a fixed
   reason (`cancelled`, `invalid_state`, `provider_error`, `email_required`, `account_exists`). The web app
   maps it to a message on the sign-in form. Details go to the API log only (no email, no tokens).

### Account resolution

In order:

1. **Known provider account** (`provider` + provider user id already linked) → that user.
2. **No email from the provider** (Facebook user without an email, or email permission declined) →
   `email_required`. Accounts are keyed by email everywhere else in the app.
3. **Email matches an existing user**:
   - **Google with `email_verified: true`** → link the provider to that user and sign in. If the existing
     account was still unverified, it could have been registered by someone else with this address: mark it
     verified, replace its password with an unusable random one, and revoke its sessions and pending
     verification tokens. The real owner can set a password through "Forgot password?".
   - **Facebook** → `account_exists` ("An account with this email already exists. Sign in with your
     password."). Facebook does not report whether an email is verified, so an email match is not proof of
     ownership.
4. **New email** → create the user: `emailVerifiedAt` = now (Google: only when `email_verified`, otherwise
   `email_required`; Facebook: the email is used as delivered), `displayName` = provider name (max 64),
   `username` = sanitized email local part (`[a-z0-9_.-]`, 3–32 chars, padded or truncated), with a
   4-digit suffix on collision (up to 5 attempts, then a random suffix), `passwordHash` = bcrypt of 32 random
   bytes (unusable password).

### Accounts without a known password

- They sign in with the provider, or set a password through "Forgot password?" (unchanged flow).
- They can enable 2FA (code only). Disabling it asks for a password, so they set one first via
  "Forgot password?"; the disable form's password field carries that hint. Accepting a provider re-login
  instead of a password is out of scope.

### Client

- `GET /auth/oauth/providers` → `{ google: boolean, facebook: boolean }`, loaded once by the auth screen;
  each button is enabled only when `true`.
- Buttons navigate (`window.location.assign`) to `{API_URL}/auth/oauth/google|facebook`.
- `useOAuthSignIn` reads `oauthCode` or `oauthError` from the web root URL on load, removes them from the
  address bar first, then exchanges the code or shows the error. `twoFactorRequired` switches to the existing
  two-factor form. The web root is used instead of a `/oauth/callback` path because `vercel.json` has no SPA
  rewrite, so a deep path is not guaranteed to serve the app.
- If `/auth/oauth/providers` fails, both buttons stay disabled with "Sign-in providers could not be loaded";
  password sign-in is unaffected.

## Technical Approach

### API

| Method | Path                             | Body / query                | Response               | Rate limit  |
| ------ | -------------------------------- | --------------------------- | ---------------------- | ----------- |
| `GET`  | `/auth/oauth/providers`          | —                           | `{ google, facebook }` | global      |
| `GET`  | `/auth/oauth/:provider`          | —                           | `302` to provider      | 20 / 15 min |
| `GET`  | `/auth/oauth/:provider/callback` | `code`, `state`, or `error` | `302` to web           | 20 / 15 min |
| `POST` | `/auth/oauth/exchange`           | `{ code }`                  | same as `/auth/login`  | 20 / 15 min |

`:provider` is validated against `google | facebook`; anything else is `404`. A provider without
credentials returns `404` on start and callback.

### Data model

```prisma
enum OAuthProvider {
  GOOGLE
  FACEBOOK
}

model OAuthAccount {
  id                String        @id @default(cuid())
  userId            String
  provider          OAuthProvider
  providerAccountId String
  createdAt         DateTime      @default(now())
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model OAuthLoginCode {
  id        String    @id @default(cuid())
  userId    String
  codeHash  String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Migration `20260916000000_add_oauth_accounts` — two new tables and one enum, additive only. Provider
tokens are not stored.

### Files

- API (new): `auth/oauth/oauth.controller.ts`, `auth/oauth/oauth.service.ts` (flow, cookie, login code),
  `auth/oauth/oauth-providers.ts` (Google/Facebook endpoints, token exchange, profile fetch via `fetch`,
  responses validated with `zod`), `auth/oauth/oauth-account.service.ts` (account resolution),
  `auth/oauth/oauth-config.ts` (credentials, callback base, startup check), `auth/dto/oauth-exchange.dto.ts`.
- API (changed): `auth.module.ts`, `auth.service.ts` (`completeSignIn`, the session / 2FA handoff shared with
  `login`), `common/web-origins.ts` (`primaryWebOrigin`, shared with email links), `prisma/schema.prisma` +
  migration, `main.ts` (`assertOAuthConfigured` at startup).
- Web: `api.ts` (`oauthStartUrl`), `hooks/useOAuthSignIn.ts` (new), `hooks/useAuthSession.ts`,
  `components/AuthScreen.tsx`, `components/settings/TwoFactorSettings.tsx` (disable-form hint).
- Docs: `docs/deployment.md`, `docs/feature-spec.md`, `docs/README.md`, `docs/security-check.md` (OAuth
  checklist lines).

### Configuration

| Variable                                   | Purpose                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client (type "Web application").                                                                                                                                                                                                                                                                             |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`   | Meta app with Facebook Login.                                                                                                                                                                                                                                                                                                   |
| `OAUTH_REDIRECT_BASE_URL`                  | Public base URL of the API as the browser sees it; the callback is `{base}/auth/oauth/:provider/callback`. Must be the same host that started the flow, or the state cookie is not sent. Defaults to `http://localhost:5173/api` (Vite proxy); the API refuses to start in production when a provider is configured without it. |

A provider counts as configured only when both its id and secret are set. The flow cookie is not signed: it
holds only random values compared against the callback, and a browser cannot be made to send a cookie it
did not receive from the API, so a signature would add a secret to manage without adding protection.

Provider consoles must register the exact callback URLs, e.g.
`https://<api-host>/auth/oauth/google/callback` and `…/facebook/callback`. The web origin for the final
redirect is the first non-wildcard `WEB_ORIGIN`, as for email links.

## Trade-offs

- **Authorization code + PKCE on the API vs. Google Identity Services / Facebook JS SDK in the browser**:
  the SDK route adds third-party scripts to the web app (CSP changes, tracking) and a different verification
  path per provider. The server-side flow keeps secrets on the API and one path for both providers. Cost:
  full-page redirects and a callback route on both apps.
- **One-time login code vs. tokens in the redirect**: putting access/refresh tokens in a URL leaks them into
  history, logs, and `Referer`. A 60 s single-use code is useless once exchanged. Cost: one extra table and
  request.
- **Facebook token exchange by `POST`**: the same form-encoded request is used for both providers. Meta
  documents the exchange as a `GET`; if a live test shows `POST` rejected, switch that provider to `GET`.
- **Plain `fetch` vs. `passport-google-oauth20` + `passport-facebook`**: the Passport strategies keep `state`
  in `express-session` (a new dependency and store) and hide PKCE behind options that differ per strategy.
  Two HTTP calls per provider are short and fully visible. Cost: we own that code, so it follows the
  integration rules (timeouts, no retries on the code exchange, validated responses).
- **Refusing Facebook email matches vs. auto-linking**: auto-linking on an unverified email is the classic
  account takeover. Cost: an existing password user cannot start using Facebook until settings-based linking
  exists.
- **Unusable random password vs. nullable `passwordHash`**: nullable touches login, reset, 2FA, and seed
  code paths. A random hash keeps every existing check correct. Cost: OAuth-only users must use "Forgot
  password?" before disabling 2FA.

## Risks & Rollback

- **Callback host mismatch** (`OAUTH_REDIRECT_BASE_URL` differs from the start host, e.g. web and API on
  different domains without a proxy) → every callback fails with `invalid_state`. Covered in deployment notes.
- **Vercel preview deployments** always return to the first `WEB_ORIGIN`, not the preview URL.
- **Meta app review**: Facebook Login in live mode needs the app published; in development mode only app
  testers can sign in.
- **Provider outage**: sign-in with that provider fails with `provider_error`; password sign-in is unaffected.
- **Rollback**: revert the code and unset the provider variables (buttons return to disabled). The migration
  is additive; the tables can stay.

## Test Plan

No automated tests are added (repository convention). Verification: `npm run typecheck`, `npm run lint`,
`npm run build`, `npm run docs:check`, `npx prisma validate`. The flow checks that need no provider or
database (unknown/unconfigured provider → 404, authorize URL parameters, `cancelled`, missing or tampered
state, cookie for another provider, missing code, web redirect origin) were exercised with a throwaway
script against `OAuthService`.

Manual, with test Google/Facebook apps on localhost:

- Providers unset → both buttons disabled; `GET /auth/oauth/google` → `404`.
- Google, new email → account created, signed in, `emailVerifiedAt` set.
- Google, email of an existing **verified** password account → same account, password still works.
- Google, email of an **unverified** password account → signed in; the old password no longer works.
- Facebook, new email → account created; Facebook with an existing email → `account_exists` message.
- Facebook with email permission declined → `email_required` message.
- User with 2FA → provider sign-in shows the 2FA form; the correct code signs in.
- Cancel at the consent screen → `cancelled` message.
- Tamper with `state` in the callback URL → `invalid_state`; replay `POST /auth/oauth/exchange` with a used
  code → `401`.
- DevTools: no access/refresh token in any URL; `oauth_flow` cookie is httpOnly and cleared after callback.

## Deployment Notes

- Run migration `20260916000000_add_oauth_accounts` before deploying the API.
- Create the Google OAuth client and the Meta app, register the callback URLs, then set `GOOGLE_*`,
  `FACEBOOK_*`, and `OAUTH_REDIRECT_BASE_URL` on the API.
- Add the same variables with dummy values to `apps/api/.env.example` (the agent cannot edit that file).
- Deploy API and web together (the web app handles `?oauthCode` / `?oauthError`).
