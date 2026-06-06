# Discord Clone Architecture

This document describes the architecture of this repository, not the full internal architecture of Discord. Use it to understand service boundaries, data ownership, realtime behavior, and scaling rules for this project.

## System Overview

The project is a TypeScript monorepo with a React web client, a NestJS API, shared contracts, PostgreSQL persistence, Socket.IO realtime events, and media storage support.

```text
+----------------------+        HTTP / Socket.IO        +----------------------+
| apps/web             | <-----------------------------> | apps/api             |
| React + Vite         |                                | NestJS + Prisma      |
| Socket.IO client     |                                | Socket.IO gateway    |
+----------+-----------+                                +----------+-----------+
           |                                                       |
           | imports shared contracts                              | Prisma
           v                                                       v
+----------------------+                                +----------------------+
| packages/shared      |                                | PostgreSQL           |
| types, schemas,      |                                | durable app data     |
| permissions, events  |                                +----------------------+
+----------------------+
                                                               |
                                                               v
                                                     +----------------------+
                                                     | Local uploads /      |
                                                     | Cloudinary media     |
                                                     +----------------------+
```

## Repository Layout

| Path              | Responsibility                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web`        | React application, app shell, auth screens, chat UI, settings modals, media preview, WebRTC UI. |
| `apps/api`        | NestJS API, Prisma access, auth, permissions, uploads, realtime gateway, business rules.        |
| `packages/shared` | Shared TypeScript types, schemas, permission constants, realtime event contracts.               |
| `docs`            | Architecture, deployment, security, and UI guidance.                                            |
| `scripts`         | Local smoke checks and helper scripts.                                                          |

## Client Layer

The web client owns presentation, optimistic UI, browser-only crypto, and WebRTC browser APIs.

Primary surfaces:

- `AppShell.tsx`: top-level authenticated app composition.
- `components/WorkspaceSidebar.tsx`: server rail, channels, channel actions, voice occupancy.
- `components/ChatPanel.tsx`: message timeline, composer, attachments, pins, reactions, typing.
- `components/MemberSidebar.tsx`: member list, presence, hover cards.
- `components/SettingsModal.tsx`: account, theme, server, role, and channel settings.
- `hooks/useChannelCall.ts`: call state and WebRTC coordination.

Client rules:

- Do not trust client permissions for protected operations.
- Reconcile optimistic UI with server responses.
- Refetch important state after reconnect.
- Keep E2EE passphrases and decrypted message bodies in the browser only.

## API Layer

The API owns authentication, authorization, persistence, upload validation, and event emission.

Main modules:

- `auth`: register, login, refresh, logout, guards, email verification.
- `users`: current-user profile and notification preferences.
- `servers`: server membership, invites, settings.
- `channels`: text and voice channels, role overrides.
- `messages`: message history, create, edit, delete, reactions, pins.
- `roles`: role CRUD and role assignment.
- `friends` and `direct-messages`: social and private messaging foundation.
- `uploads`: local or Cloudinary-backed media persistence.
- `permissions`: centralized permission evaluation.
- `realtime`: Socket.IO gateway and room/event orchestration.

API rules:

- Validate DTOs at the boundary.
- Load the authenticated user from trusted token state.
- Check membership before reading server, channel, message, or media data.
- Check permissions before writes.
- Use transactions for multi-row invariants.
- Persist first, emit second.

## Data Layer

PostgreSQL is the durable source of truth. Prisma maps application models to database tables.

Important ownership rules:

- Users own account identity and profile fields.
- Servers own members, roles, channels, invites, and audit logs.
- Channels own channel messages and read states.
- Conversations own direct messages.
- Messages own attachments, reactions, and pins.
- Upload metadata must be persisted separately from physical file storage.

Data consistency rules:

- Server creation should create owner membership, default role, and default channel in one transaction.
- Message deletes should be soft deletes when history or auditability matters.
- Reactions should be idempotent per user, message, and emoji.
- Invite joins should be idempotent for existing members.
- Channel reorder operations should be transactional.

## Realtime Layer

Socket.IO is used for authenticated realtime delivery.

Room model:

| Room              | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| User room         | Direct notifications and current-user updates.              |
| Server room       | Server-level changes such as channel/member updates.        |
| Channel room      | Text channel messages, typing, pins, reactions, read state. |
| Conversation room | Direct-message events.                                      |
| Voice room        | Voice presence and WebRTC signaling.                        |

Realtime rules:

- Authenticate socket connections.
- Authorize every room join.
- Broadcast only to authorized subscribers.
- Include enough payload data for clients to update local state without a full refetch.
- Use server-generated IDs as the source of truth.
- After reconnect, clients should refetch missed state from HTTP endpoints.

## Permission Model

The backend permission service is the source of truth.

Permission checks should consider:

- Server ownership.
- Assigned roles.
- Channel-level role overrides.
- Target resource ownership.
- Whether the action is administrative, moderation-related, or user-owned.

Examples:

- `channel.manage` gates channel create, update, delete, and reorder.
- `message.send` gates channel message creation.
- `message.manage` gates moderation of other users' messages.
- `role.manage` gates role CRUD and role assignment.
- `invite.create` gates invite creation.

## Upload and Media Architecture

Development storage can use local files. Hosted environments should use Cloudinary or another object storage provider.

Rules:

- Validate MIME type and size server-side.
- Avoid user-controlled filesystem paths.
- Store authorization metadata with each upload.
- Keep Cloudinary credentials only in API environment variables.
- Use chunked uploads for large files to reduce request timeout and memory pressure.

## E2EE Boundary

Optional channel passphrase E2EE is a client-side feature.

- The browser derives keys from the passphrase.
- The API stores ciphertext and metadata.
- The API must not receive plaintext message bodies for encrypted channels.
- Failed decryption should render a safe fallback state.
- Future stronger E2EE should use per-user identity keys, key rotation, encrypted attachments, and recovery flows.

## Scaling Rules

- Design for horizontal scale: avoid process-local assumptions for durable state.
- Use Redis adapter or equivalent before running multiple Socket.IO API instances.
- Keep permission checks efficient and cache only when invalidation is clear.
- Keep writes idempotent where user retries are likely.
- Apply backpressure to uploads and realtime fan-out.
- Log authorization failures, upload failures, socket join failures, and unexpected event errors.
- Add metrics before guessing at performance bottlenecks.

## Production Topology

Recommended production layout:

- Web: Vercel static Vite deployment.
- API: Render Web Service.
- Database: Render PostgreSQL.
- Media: Cloudinary.
- CI/CD: GitHub Actions.

See `docs/deployment.md` for operational details.

## Architecture Checklist

- [x] Shared contracts exist in `packages/shared`.
- [x] API modules are separated by domain.
- [x] Permissions are centralized server-side.
- [x] Socket events are authorized by room.
- [x] Uploads support local and hosted storage.
- [x] UI is split into focused app-shell components.
- [ ] Redis adapter or equivalent for multi-instance Socket.IO.
- [ ] Production migration workflow fully replaces `db:push`.
- [ ] Observability dashboard for API, realtime, and uploads.
- [ ] Load testing for high-volume message and upload paths.
