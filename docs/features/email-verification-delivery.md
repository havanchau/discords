# Feature Spec: Email Verification Delivery

Registration sends the verification link to the user's mailbox (Gmail over SMTP) and never returns
the token or link in the API response.

## Goal

Only someone who controls the mailbox can verify an account.

Acceptance criteria:

- `POST /auth/register` never returns `verificationToken` or `verificationUrl`, whatever the SMTP
  configuration.
- With SMTP configured for Gmail, registering sends an email containing the verification link to the
  registered address.
- Opening the link verifies the account and signs the user in (unchanged flow).
- A user whose email was lost, failed to send, or expired can request a new link without re-registering.
- The verification link, token, and email address are never written to production logs.

## Scope

- **In scope**: register response, verification email delivery and logging, a resend endpoint, the
  auth screen verification UI, Gmail SMTP configuration notes.
- **Out of scope**: changing token storage (bcrypt scan in `verifyEmail`), email templates/branding,
  a third-party email provider (Resend, SES), OAuth sign-in.

## Current Behavior

- `AuthService.register` creates the user and token, awaits `EmailService.sendVerificationEmail`, and
  when mail was not sent returns `verificationToken` and `verificationUrl` in the response
  (`apps/api/src/modules/auth/auth.service.ts:44-52`). Anyone can therefore register any address and
  verify it without access to the mailbox whenever SMTP is unset.
- `sendVerificationEmail` logs `email` and the full link at `log` level in every environment when
  `SMTP_HOST` is unset, and builds the link from the raw `WEB_ORIGIN`, which may be a comma-separated
  list with wildcards (`apps/api/src/modules/auth/email.service.ts:12-31`).
- Sending is awaited inside `register`: an SMTP failure returns `500` after the user row is created, and
  a retry then fails with `409 Email or username already exists`. There is no way to request another
  link; the token expires after 1 hour (`auth.service.ts:208-222`).
- The web client copies `verificationToken` from the register response into the verification form
  (`apps/web/src/hooks/useAuthSession.ts:114-121`) and always shows a "Paste the token" field after
  registering (`apps/web/src/components/AuthScreen.tsx:266-279`).
- `SMTP_PORT` is read with `config.get<number>`, which returns the raw env string.

## Changes

### API rules

- **Register** response is always:
  `{ verificationRequired: true, email, message: 'Check your inbox for a verification link.' }`.
- **Delivery** is not awaited in the request, matching `PasswordResetService.requestReset`. A delivery
  failure is logged with the error only (no address, no token, no link); registration still succeeds and
  the user can resend.
- **Without SMTP**: non-production logs the link at `warn` (for local development); production logs only
  `Verification email requested but SMTP_HOST is not configured`. Same policy as password reset.
- **Link origin**: first non-wildcard origin in `WEB_ORIGIN`, shared with the password reset link.
- **Resend** `POST /auth/resend-verification`, body `{ email }`:
  - Always `200 { ok: true, message: 'If that account is waiting for verification, a new link has been sent.' }`,
    whether the email is unknown, already verified, or pending — so it cannot be used to discover accounts.
  - For a pending account: invalidate unused tokens, create a new 1-hour token, send the email. All of it
    runs after the response: the token is bcrypt-hashed (~250 ms), so doing it inline would reveal a pending
    account through response time.
  - Rate limit 5 / 15 min per client, like `forgot-password`.
- `verify-email` and login are unchanged: an unverified login still returns `401 Email is not verified`.

### Client

- Remove `verificationToken` from the register response type; nothing is pre-filled from the API.
- After register: switch to sign in and show `Check your inbox at <email> for a verification link.`
  with a **Resend verification email** button.
- Login failing with `Email is not verified` shows the same resend button for the typed email.
- Resend shows the generic API message as a notice.
- Opening `/verify-email?token=...` keeps today's behaviour: token loaded, address bar cleaned, user
  confirms with **Verify email**. The manual "paste the token" field is removed — the email only contains a
  link — so the verify form only renders when a token came from the link.

### Gmail configuration

Gmail requires an App Password (Google account with 2-Step Verification → App passwords); the normal
account password is rejected.

| Variable      | Value                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| `SMTP_HOST`   | `smtp.gmail.com`                                                        |
| `SMTP_PORT`   | `465`                                                                   |
| `SMTP_SECURE` | `true`                                                                  |
| `SMTP_USER`   | the Gmail address                                                       |
| `SMTP_PASS`   | the 16-character App Password                                           |
| `SMTP_FROM`   | `Discords <the same Gmail address>` — Gmail rewrites a different sender |

`SMTP_PORT` is parsed to a number before it reaches nodemailer.

## Technical Approach

### Files

- `apps/api/src/modules/auth/auth.service.ts` — `register` drops the token from the response and sends
  without awaiting; new `resendVerification(email)`.
- `apps/api/src/modules/auth/email.service.ts` — dev/prod logging policy, shared link-origin helper,
  numeric `SMTP_PORT`.
- `apps/api/src/modules/auth/dto/resend-verification.dto.ts` — `{ email }` with `@IsEmail()`, same shape as
  `forgot-password.dto.ts`.
- `apps/api/src/modules/auth/auth.controller.ts` — `POST /auth/resend-verification`.
- `apps/web/src/hooks/useAuthSession.ts` — response type, pending-verification email, `resendVerification`.
- `apps/web/src/components/AuthScreen.tsx` — resend button, verify form only with a link token.
- `docs/deployment.md`, `docs/feature-spec.md`, `docs/features/password-reset.md` — Gmail notes, remove
  "when SMTP is configured" wording, drop the stale remark that registration returns the token.
- `apps/api/.env.example` is not changed by this task: it is outside the agent's read permissions. The
  Gmail values above are the reference; add them there as dummy values when editing that file by hand.

### API

| Method | Path                        | Body        | Response                                   | Rate limit |
| ------ | --------------------------- | ----------- | ------------------------------------------ | ---------- |
| `POST` | `/auth/register`            | unchanged   | `{ verificationRequired, email, message }` | 5 / 15 min |
| `POST` | `/auth/resend-verification` | `{ email }` | `{ ok, message }`                          | 5 / 15 min |

No database change: `EmailVerificationToken` already supports invalidating and reissuing tokens.

## Trade-offs

- **Remove the token from the response vs. keep it for local development**: keeping it is exactly the
  hole being closed, and it would reappear in any deployment that forgets SMTP. Local development reads
  the link from the API log instead, as password reset already does.
- **Fire-and-forget delivery vs. awaiting SMTP**: awaiting lets register report "email failed", but a slow
  or failing SMTP server then blocks or breaks sign-up after the user row exists. Not awaiting keeps
  sign-up fast and consistent with password reset; the resend endpoint covers a lost email. Cost: the user
  is not told immediately that sending failed.
- **Gmail SMTP vs. a transactional provider**: Gmail needs no new dependency or account and works with the
  existing nodemailer transport, but caps sending (about 500 recipients/day on a personal account) and
  may land in spam from a shared host. Switching later only changes `SMTP_*` values.
- **Generic resend response**: register already reveals existing emails via `409`, but resend should not
  add a second, unthrottled way to probe accounts.

## Risks & Rollback

- **Breaking API change**: clients relying on `verificationToken` in the register response (only the web
  app in this repo) stop auto-verifying. Web and API must deploy together.
- **Production without SMTP**: new users cannot verify at all. Deployment must configure SMTP first.
- **Gmail blocks sign-in** (App Password revoked, daily cap): emails fail and are logged as delivery
  errors; users can resend once fixed.
- **Rollback**: revert the commit; no migration involved.

## Test Plan

No automated tests are added (repository convention: verification by typecheck, lint, build, and manual
scenarios).

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`.
- **Manual, SMTP unset (local)**: register → response has no token/URL (DevTools Network) → link appears
  in the API log → open it → Verify email → signed in.
- **Manual, Gmail configured**: register with a real Gmail address → email arrives → link verifies and
  signs in.
- **Manual, resend**: register → sign in shows `Email is not verified` → Resend → a new email arrives and
  the previous link returns `Invalid or expired verification token`.
- **Manual, resend with unknown or verified email**: same generic `200` message, no email sent.
- **Manual, production logging**: run with `NODE_ENV=production` and SMTP unset → log contains only the
  warning, no address or link.

## Deployment Notes

- Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` on the API host
  (Gmail values above) before deploying.
- `WEB_ORIGIN`'s first non-wildcard origin must be the public web URL, since it is used in the link.
- Deploy API and web together (register response contract changes).
- No migration.
