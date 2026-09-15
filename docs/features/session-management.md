# Feature Spec: Session Management

Lets users see where they are signed in and sign out other devices.

## Goal

A signed-in user can list their active sessions and revoke any of them, with revoked devices losing API and realtime access immediately.

Acceptance criteria:

- `GET /auth/sessions` lists the caller's unrevoked, unexpired sessions with device description data, dates, and which one is current.
- `DELETE /auth/sessions/:sessionId` revokes one of the caller's sessions; another user's session id returns `404`.
- `POST /auth/sessions/revoke-others` revokes every session except the current one.
- Sockets authenticated with a revoked session are disconnected at revocation time.
- Revoking the current session from the UI signs the user out locally.

## Scope

- **In scope**: session listing and revocation endpoints, `lastActiveAt` tracking on refresh, socket disconnection, "Devices" section in user settings.
- **Out of scope**: IP address or location display, changing "Log out" to revoke only the current session, new-login email alerts.

## Current Behavior

- `Session` stores `userAgent`, `createdAt`, `expiresAt`, `revokedAt` (`schema.prisma`).
- `JwtAuthGuard` loads the session per request but exposes only `id`, `email`, `username` (`jwt-auth.guard.ts:47`).
- Logout revokes all of the user's sessions (`auth.service.ts:96`).
- Sockets verify the session only when connecting (`realtime.gateway.ts:402`).

## Changes

### Rules

- A session is active when `revokedAt` is null and `expiresAt` is in the future.
- `lastActiveAt` is set at session creation and on every token refresh (about every 15 minutes while the app is open). It is not written on every request.
- Revocation sets `revokedAt`; it is idempotent for already revoked sessions of the caller.
- `RequestUser` gains `sessionId`; the guard and socket authentication now also require the JWT `sid` claim to be a string.
- Realtime: `RealtimePublisher.disconnectSessions(userId, sessionIds)` fetches the sockets in `user:<id>` and disconnects those whose `data.user.sessionId` matches.

### Client

- "Devices" section in the profile settings dialog, below the profile form: one row per session with a readable description ("Chrome on Windows"), "This device" badge, last active time, and a "Sign out" button; "Sign out all other devices" button; loading, empty, and error states.
- `describeUserAgent(userAgent)` (pure) maps common browser and OS tokens, falling back to "Unknown device".

## Technical Approach

### Data model

`Session.lastActiveAt DateTime @default(now())` and `@@index([userId, revokedAt])`. Migration `20260915008000_add_session_activity`.

### API

| Method | Path | Response | Rate limit |
| --- | --- | --- | --- |
| `GET` | `/auth/sessions` | `{ sessions: Array<{ id, userAgent, createdAt, lastActiveAt, expiresAt, current }> }` | default |
| `DELETE` | `/auth/sessions/:sessionId` | `{ ok: true, current: boolean }` | 30/min |
| `POST` | `/auth/sessions/revoke-others` | `{ revoked: number }` | 10/min |

### Files

- API: `auth/sessions.controller.ts`, `auth/sessions.service.ts`, `auth/jwt-auth.guard.ts`, `common/request-user.ts`, `auth/auth.service.ts` (`lastActiveAt` on refresh), `auth/auth.module.ts`, `realtime/realtime-publisher.service.ts`, `realtime/realtime.gateway.ts` (`sid` check).
- Web: `api.ts`, `utils/userAgent.ts` (+ test), `hooks/useSessions.ts`, `components/settings/SessionsSettings.tsx`, `AccountSecuritySettings.tsx` (rendered by `SettingsModal.tsx` under the profile form, so the profile form itself is unchanged), `settings/types.ts` (`signOut`), `AppShell.tsx`.

## Trade-offs

- **Updating `lastActiveAt` on refresh vs. every request**: per-request writes would add a database write to every API call. Refresh granularity (15 minutes) is enough to recognize an abandoned device.
- **Not storing IP addresses**: IPs are personal data and would need a retention policy; the user agent plus dates are sufficient to identify one's own devices.
- **Keeping logout as "revoke all"**: changing it alters existing behavior users may rely on; with this feature users can still revoke selectively.

## Risks & Rollback

- **Risk**: access tokens of a revoked session are rejected by the guard immediately because it checks the session row on each request; no token-lifetime gap exists.
- **Rollback**: revert code; the migration is additive.

## Test Plan

- **Automated**: `userAgent.test.ts`; `sessions.int.test.ts` (list only own active sessions, revoke other user's session returns 404, revoke-others keeps current, revoked token rejected by the guard, challenge-style token without `sid` rejected).
- **Manual**: sign in on two browsers → Devices shows both → sign out the other from the first → the second browser's socket disconnects and its next request returns to the sign-in screen.

## Deployment Notes

- Run migration `20260915008000_add_session_activity` before deploying the API.
