# Feature Spec: Two-Factor Authentication

Time-based one-time passwords (TOTP, RFC 6238) as a second sign-in factor, with recovery codes.

## Goal

A user can enable an authenticator app; afterwards signing in requires a 6-digit code or a single-use recovery code.

Acceptance criteria:

- Setup returns a new base32 secret and an `otpauth://` URI; 2FA is enabled only after a valid code from that secret.
- Enabling returns 10 recovery codes once; they are stored only as SHA-256 hashes.
- With 2FA enabled, `POST /auth/login` returns `{ twoFactorRequired: true, challengeToken }` instead of tokens.
- `POST /auth/2fa/verify-login` accepts the challenge plus a TOTP code (±1 step) or an unused recovery code and returns the normal session payload.
- A TOTP step can be used only once per user, which blocks replay of an observed code.
- The challenge token cannot be used as an access token for REST or sockets.
- Disabling requires the current password and a valid code.
- TOTP secrets are encrypted at rest with AES-256-GCM using `TWO_FACTOR_ENCRYPTION_KEY`.

## Scope

- **In scope**: TOTP and secret encryption helpers, setup/enable/disable/status/regenerate endpoints, login challenge, auth screen code step, settings section.
- **Out of scope**: QR code rendering (no QR dependency in the repo; users enter the key or open the URI), WebAuthn, SMS, enforcing 2FA for server moderators.

## Current Behavior

- `login` creates a session right after the password check (`auth.service.ts:51`).
- `JwtAuthGuard` and socket authentication verify any JWT signed with `JWT_SECRET` and then look up `sid` (`jwt-auth.guard.ts:30`, `realtime.gateway.ts:411`).
- The auth screen has no code step (`components/AuthScreen.tsx`).

## Changes

### Rules

- Secret: 20 random bytes, base32 without padding; codes are 6 digits, 30-second step, HMAC-SHA1; verification window ±1 step.
- `twoFactorLastUsedStep` stores the last accepted step; a code whose step is not greater is refused.
- Recovery codes: 10 codes, format `xxxx-xxxx` (lowercase hex), compared case-insensitively ignoring the dash; each marks `usedAt` when used.
- Setup when already enabled returns `409`; enable without a pending secret returns `400`.
- Challenge token: JWT `{ sub, purpose: '2fa-login' }` signed with a secret derived from `JWT_SECRET` plus a fixed suffix, expiring in 5 minutes. REST and socket authentication require a string `sid`, which the challenge does not have, and the different signing secret makes verification fail anyway.
- Invalid verify-login code or challenge returns `401 Invalid two-factor code`; disable with a wrong password or code returns `400 Invalid password or code`.
- Production start fails if `TWO_FACTOR_ENCRYPTION_KEY` is unset or shorter than 32 characters (same pattern as `JWT_SECRET`); development falls back to a fixed development key.

### Client

- `useAuthSession` handles `twoFactorRequired`: mode `two-factor` shows a code field that accepts a 6-digit code or recovery code, with "Back to sign in".
- Settings "Two-factor authentication" section: status; Enable → shows the key (copy button) and an "Open in authenticator" link for the URI, then a code field; after enabling shows recovery codes with copy and a warning that they are shown once; Disable form (password + authenticator or recovery code); Regenerate recovery codes (authenticator code only, so a recovery code cannot mint new ones).

## Technical Approach

### Data model

- `User`: `twoFactorSecret String?`, `twoFactorPendingSecret String?`, `twoFactorEnabledAt DateTime?`, `twoFactorLastUsedStep Int?`.
- New model:

```prisma
model TwoFactorRecoveryCode {
  id        String    @id @default(cuid())
  userId    String
  codeHash  String
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Migration `20260915009000_add_two_factor_auth`.

### API

| Method | Path                       | Auth   | Body                       | Response                                                              | Rate limit  |
| ------ | -------------------------- | ------ | -------------------------- | --------------------------------------------------------------------- | ----------- |
| `GET`  | `/auth/2fa`                | bearer | —                          | `{ enabled, enabledAt, recoveryCodesRemaining }`                      | default     |
| `POST` | `/auth/2fa/setup`          | bearer | —                          | `{ secret, otpauthUrl }`                                              | 10 / 15 min |
| `POST` | `/auth/2fa/enable`         | bearer | `{ code }`                 | `{ recoveryCodes }`                                                   | 10 / 15 min |
| `POST` | `/auth/2fa/disable`        | bearer | `{ password, code }`       | `{ ok: true }`                                                        | 10 / 15 min |
| `POST` | `/auth/2fa/recovery-codes` | bearer | `{ code }`                 | `{ recoveryCodes }`                                                   | 5 / 15 min  |
| `POST` | `/auth/2fa/verify-login`   | public | `{ challengeToken, code }` | session payload                                                       | 10 / 15 min |
| `POST` | `/auth/login`              | public | unchanged                  | session payload or `{ twoFactorRequired, challengeToken, expiresIn }` | unchanged   |

### Files

- API: `auth/totp.ts`, `auth/secret-box.ts`, `auth/two-factor-config.ts` (key lookup and production guard), `auth/two-factor-challenge.service.ts` (challenge signing, separate so `AuthService` and `TwoFactorService` do not depend on each other), `auth/two-factor.service.ts`, `auth/two-factor.controller.ts`, `dto/two-factor.dto.ts`, `auth.service.ts` (login branch; `createSession` becomes public), `auth.module.ts`, `jwt-auth.guard.ts`, `realtime.gateway.ts`, `main.ts`, `docs/deployment.md` (environment variable). `.env.example` is not readable in this environment, so the variable still needs to be added there.
- Web: `hooks/useAuthSession.ts` (typed auth response union), `components/auth/TwoFactorLoginForm.tsx`, `AuthScreen.tsx`, `hooks/useTwoFactor.ts`, `components/settings/TwoFactorSettings.tsx`, `AccountSecuritySettings.tsx`, `SettingsModal.module.css` (recovery code list).

## Trade-offs

- **Implementing TOTP with `node:crypto` vs. `otplib`/`speakeasy`**: the algorithm is about 40 lines and verified against the RFC vectors; avoiding a dependency keeps the auth surface auditable. Cost: we own the code.
- **Encrypting secrets with a dedicated key vs. storing plaintext**: a database leak alone does not expose second factors. Cost: one more required production secret; rotating it invalidates enrolled secrets (users must re-enroll).
- **No QR code**: adding a QR library is a new dependency for one screen; manual key entry works with every authenticator. Can be added later.

## Risks & Rollback

- **Risk**: losing both the authenticator and recovery codes locks the account; there is no admin reset flow yet.
- **Rollback**: revert code. Enabled users could then sign in with password only; the migration is additive.

## Test Plan

- **Manual**: enable with an authenticator app → sign out → sign in → enter code → signed in; use a recovery code once; disable.

## Deployment Notes

- Run migration `20260915009000_add_two_factor_auth` before deploying the API.
- Set `TWO_FACTOR_ENCRYPTION_KEY` (at least 32 random characters) in production before deploying; keep it stable.
