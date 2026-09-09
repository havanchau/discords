# Security Checklist

This document defines security expectations for this Discord-like application. It is focused on risks inside this repository and intentionally avoids duplicating external CVE tracking.

## Security Ownership

| Area                    | Owner                                              |
| ----------------------- | -------------------------------------------------- |
| Authentication          | `apps/api/src/modules/auth`                        |
| Authorization           | `apps/api/src/modules/permissions` and API guards  |
| Realtime access         | `apps/api/src/modules/realtime`                    |
| Upload validation       | `apps/api/src/modules/uploads`                     |
| Client secrets          | Environment variables and deployment configuration |
| Browser-only encryption | `apps/web/src/e2ee.ts` and encrypted message UI    |

## Authentication

- Store password hashes only; never store plain text passwords.
- Use a strong password hashing algorithm.
- Keep JWT secrets and refresh-token secrets out of source control.
- Revoke refresh tokens on logout.
- Return consistent `401` responses for unauthenticated requests.
- Never expose password hashes, refresh tokens, provider tokens, or session secrets to the client.
- Rate-limit login, register, refresh, and verification endpoints.

## Authorization

- Check permissions server-side for every protected operation.
- Never trust user IDs, role IDs, permissions, or ownership flags sent by the client.
- Check membership before reading server, channel, message, invite, or media metadata.
- Check channel overrides before channel reads and writes.
- Prevent non-owners from removing or downgrading owners.
- Keep moderation permissions separate from regular user-owned actions.
- Include tests for owner, admin, member, private-channel, and no-access cases.

## Realtime Security

- Authenticate every Socket.IO connection.
- Authorize every room join.
- Broadcast only to rooms the user is allowed to read.
- Avoid sending sensitive fields in event payloads.
- Refetch authoritative state after reconnect instead of trusting missed client events.
- Treat typing, presence, call, and WebRTC signaling events as permission-protected.
- Log rejected room joins and unexpected socket errors.

## Upload Security

- Validate file size server-side.
- Validate MIME type and extension server-side.
- Store files outside the repository.
- Never use user-controlled paths directly.
- Persist upload metadata needed for authorization and cleanup.
- Keep Cloudinary credentials only in API environment variables.
- Require authorization before serving private channel files.
- Use chunked uploads for large files to reduce memory pressure.

## Input Validation

- Validate DTOs at the API boundary.
- Normalize channel names and slugs.
- Trim message content before persistence.
- Allow empty messages only when attachments exist.
- Use Prisma parameterization instead of raw interpolated SQL.
- Sanitize or safely render user-controlled markdown, links, filenames, and preview text.
- Never evaluate user input as code.

## E2EE and Privacy

- Keep passphrases and decrypted message bodies in the browser.
- Store ciphertext for encrypted channel messages.
- Render a safe locked or undecryptable state when decryption fails.
- Do not log plaintext message bodies, passphrases, tokens, or upload URLs with private access semantics.
- Treat invisible presence as privacy-sensitive; only broadcast presence to authorized viewers.

## Environment and Secrets

- Do not commit `.env`.
- Use `.env.example` for names and non-secret defaults only.
- Rotate secrets if they are ever exposed in logs, commits, screenshots, or chat.
- Keep frontend `VITE_*` variables limited to public configuration.
- Keep API-only secrets out of Vercel client builds.

## Abuse and Rate Limiting

Apply rate limits or abuse controls to:

- Auth endpoints.
- Message creation.
- Typing events.
- Uploads and chunk uploads.
- Invite creation and invite joins.
- Friend requests.
- Reactions.
- WebRTC signaling events.

## Server Administration

- Use least privilege for bots, deploy tokens, and cloud credentials.
- Avoid administrator-level OAuth scopes unless required.
- Keep audit logs for server, channel, role, invite, pin, and moderation-adjacent actions.
- Make destructive actions explicit in the UI and API.
- Prefer soft delete where auditability matters.

## Incident Response

If an account is compromised:

1. Revoke refresh tokens and active sessions.
2. Rotate password and require re-login.
3. Review recent audit log entries.
4. Remove suspicious invites or webhooks.

If a bot token, JWT secret, API key, or Cloudinary secret is exposed:

1. Revoke or rotate the secret immediately.
2. Remove the secret from git history if it was committed.
3. Redeploy affected services.
4. Review logs for abuse during the exposure window.

If a server is raided or spammed:

1. Disable new invites.
2. Tighten role permissions.
3. Rate-limit message actions.
4. Remove abusive members.
5. Preserve audit logs for review.

## Verification Checklist

- [x] DTO validation is enabled in the API.
- [x] Helmet and CORS are configured.
- [x] Upload type and size allowlists exist.
- [x] Private endpoints are guarded.
- [x] Permissions are centralized in backend services.
- [x] Refresh-token based auth flow exists.
- [x] Rate-limit coverage is tested for high-abuse endpoints.
- [x] Permission tests cover channel overrides.
- [ ] Upload authorization is covered by integration tests.
- [x] Realtime room authorization is covered by socket tests.
- [ ] Production secrets are rotated and documented outside source control.
