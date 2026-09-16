# Feature Spec: Password Reset

Email-based recovery for users who forgot their password.

## Goal

A user can request a reset link by email and set a new password with it; existing sessions are signed out.

Acceptance criteria:

- `POST /auth/forgot-password` always returns the same `200` response, whether or not the email has an account.
- A reset token is 32 random bytes, stored only as a SHA-256 hash, valid for 30 minutes, single use; requesting a new one invalidates older unused tokens.
- `POST /auth/reset-password` enforces the registration password policy, updates the password, marks the token used, and revokes every session of that user.
- The raw token is never returned by the API; it is only emailed (or, without SMTP outside production, written to the server log).
- The web app offers "Forgot password?" on sign in and a reset form at `/reset-password?token=...`.

## Scope

- **In scope**: token model, two public endpoints, email template, auth screen flows.
- **Out of scope**: password change from settings while signed in, reset by username, SMS recovery.

## Current Behavior

- There is no reset flow; `AuthScreen` offers sign in, register, and email verification (`components/AuthScreen.tsx`).
- Email verification hashes tokens with bcrypt and scans every unexpired token on verify (`auth.service.ts:66`).
- `EmailService` sends verification mail, or logs the link when `SMTP_HOST` is unset (`email.service.ts`).
- Register returns the verification token in the response when mail is not sent (`auth.service.ts:44`).

## Changes

### Rules

- Forgot password: body `{ email }`; response `{ ok: true, message: 'If an account exists for that email, a reset link has been sent.' }`. The email is sent without awaiting delivery in the request so response time does not reveal whether the account exists; delivery errors are logged with the error only (no address, no token).
- Reset password: body `{ token, password }`; invalid, used, or expired token returns `400 Invalid or expired reset token`. Sockets of the revoked sessions are disconnected after the reset commits.
- The reset link uses the first non-wildcard origin in `WEB_ORIGIN`.
- Password policy is shared with registration: 8–128 characters with lowercase, uppercase, digit, and symbol.
- Reset does not change `emailVerifiedAt` and does not disable two-factor authentication.
- Without SMTP: in non-production the reset URL is logged at `warn`; in production nothing but a "SMTP not configured" warning is logged.

### Client

- Auth modes: `login | register | forgot | reset`.
- "Forgot password?" button under the sign-in password field opens the forgot form (email only).
- Loading `/reset-password?token=` switches to reset mode, strips the token from the address bar, and shows new password + confirm fields (confirm must match before submit).
- Success returns to sign in with "Password updated. Sign in with your new password."

## Technical Approach

### Data model

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Migration `20260915007000_add_password_reset_tokens`.

### API

| Method | Path                    | Body                  | Response          | Rate limit  |
| ------ | ----------------------- | --------------------- | ----------------- | ----------- |
| `POST` | `/auth/forgot-password` | `{ email }`           | `{ ok, message }` | 5 / 15 min  |
| `POST` | `/auth/reset-password`  | `{ token, password }` | `{ ok: true }`    | 10 / 15 min |

### Files

- API: `auth/password-reset.service.ts`, `auth/dto/forgot-password.dto.ts`, `reset-password.dto.ts`, `password-policy.ts` (shared regex and message, used by `register.dto.ts`), `auth.controller.ts`, `auth.module.ts`, `email.service.ts`.
- Web: `hooks/useAuthSession.ts` (returns an `authScreen` props object so `AppShell.tsx` no longer lists each field), `components/auth/PasswordResetForms.tsx`, `components/AuthScreen.tsx`, `AuthScreen.module.css` (the "Forgot password?" link only), `components/app/AuthGate.tsx` (reuses `AuthScreenProps`).

## Trade-offs

- **SHA-256 lookup vs. bcrypt like verification tokens**: the token has 256 bits of entropy, so a fast hash is not brute-forceable, and a unique index lookup avoids scanning every token with bcrypt. Cost: two token styles in the auth module.
- **Not returning the token without SMTP**: returning it would let anyone take over any account. Local development reads the link from the API log instead; email verification follows the same rule (see `email-verification-delivery.md`).
- **Revoking all sessions**: a reset usually means the password may be compromised; staying signed in elsewhere would defeat it.

## Risks & Rollback

- **Risk**: email scanners that pre-fetch links do not consume tokens, since consuming requires a `POST` with the new password.
- **Rollback**: revert code; the migration is additive.

## Test Plan

- **Manual**: request reset → copy URL from API log → open → set a new password → old session in another tab is signed out on its next request → sign in with the new password.

## Deployment Notes

- Run migration `20260915007000_add_password_reset_tokens` before deploying the API.
- Production needs `SMTP_HOST` (and related `SMTP_*`) configured for users to receive links; `WEB_ORIGIN` must be the public web URL used in the link.
