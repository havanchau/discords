# Discord Clone

Real-time Discord-style chat application built as a full-stack monorepo with React, NestJS, Prisma, PostgreSQL, Socket.IO, and object-storage-ready file uploads.

## Project Highlights

- Real-time server/channel chat with Socket.IO rooms, typing indicators, reactions, replies, message editing, and soft delete.
- Discord-like workspace UI with server rail, channel sidebar, member list, upload previews, link previews, and responsive app-shell layout.
- Role-based permissions for server/channel actions, including manage roles, manage channels, send messages, create invites, connect voice, and upload files.
- Voice/video/screen-share call foundation using WebRTC signaling over the realtime gateway, plus recorded voice messages in chat.
- Auth flow with JWT access tokens, refresh tokens, email verification support, profile editing, and avatar updates.
- File, image, and video uploads with local development storage plus Cloudinary support for hosted media delivery.
- Chunked large-file uploads for files above 5 MB, reducing request timeout and API memory pressure.
- Optional channel passphrase E2EE for text messages using browser Web Crypto AES-GCM; the backend stores ciphertext and cannot decrypt message bodies without the passphrase.
- Security-focused backend hardening: DTO validation, upload type allowlist, rate limiting, Helmet/CORS setup, and guarded private endpoints.
- Maintainable frontend structure: `AppShell` is split into focused components and hooks such as chat panel, settings modal, workspace sidebar, member sidebar, and channel call hook.

## Feature Roadmap

Recently added:

- Active screen-share and call banner in text channels, including receive-only `Join stream`.
- Named typing indicators, so the composer can show who is typing instead of a generic message.
- Channel unread indicators and mention badges for visited channels.
- Server-backed pinned messages with permission checks and a pinned-message panel from the notifications toolbar.
- Image and video preview overlay for message attachments.
- Voice message recording from the composer with inline audio playback.
- Auth-screen visual polish, motion, and responsive background treatment.
- Visual engagement pass: server rail tooltips, member profile hover cards, date dividers, message skeletons, custom voice-message waveform cards, channel topic context, and selectable app themes.
- Persistent channel read state with unread counts restored from PostgreSQL after refresh/relogin.
- Channel role overrides for `VIEW_CHANNEL` and `SEND_MESSAGES`, including private-channel access controls.
- Server audit log foundation for server, channel, role, invite, pin, and moderation-adjacent actions.
- Voice channel occupancy in the sidebar, showing active call participants under voice channels.

Recommended next features:

- Realtime Direct Messages: socket-backed DM delivery, typing indicators, and unread DM counts.
- Friend system polish: richer block/unblock flows and friend-scoped presence.
- Member-specific channel overrides and voice permission overrides, beyond the current role-level text permissions.
- Notification settings UI: mute server/channel, only mentions, desktop notifications, and notification inbox.
- Deployment hardening: production migrations, health checks for Render, seed-safe demo data, and CI smoke tests against deployed URLs.

Feature expansion backlog to make the app feel closer to a full Discord-class product:

- Realtime Direct Messages with socket delivery, presence, and unread private chat.
- Friend system polish with clearer pending/block management and DM shortcut affordances.
- Backend message search for channel search results beyond the currently loaded page.
- Persistent read state for DMs, including unread counts that survive refresh/relogin.
- Notification preferences for muted servers/channels, mention-only mode, and an event inbox.
- Member-level channel permission overrides and voice access overrides.
- Server discovery and invite preview before joining a server.
- Full message search with author/date/attachment filters.
- Mentions with `@user`, `@here`, `@everyone`, autocomplete, and mention-specific badges.
- Threads for side conversations and unread thread counters.
- Moderation tools including kick, ban, timeout, server mute, and audit log.
- Realtime updates for server-backed pinned messages.
- Emoji picker with recently used reactions.
- Upload progress with cancel/retry for file, image, video, and voice attachments.
- Stronger E2EE with per-user identity keys, key rotation, encrypted attachments, and recovery flows.

Visual polish roadmap now implemented in the web client:

- Presence: richer status dots and member hover cards with banner, bio, and role chips.
- Channel header: topic/context line under the active channel name.
- Messages: loading skeletons, date dividers, smoother message entry and hover affordances.
- Voice messages: waveform-styled audio attachment cards.
- Empty states and attachment cards: stronger visual hierarchy while keeping the app dense.
- Server rail: hover tooltips and smoother active indicators.
- Themes: Discord dark, Midnight, Slate, and OLED options from profile settings.
- Micro-interactions: subtle hover, click, modal, banner, and composer transitions.

## Tech Stack

- Frontend: React, Vite, TypeScript, Socket.IO client, lucide-react.
- Backend: NestJS, TypeScript, Prisma, PostgreSQL, Socket.IO, JWT auth.
- Storage: local uploads for development, Cloudinary for hosted image/video/file delivery.
- Tooling: npm workspaces, Docker Compose, ESLint, TypeScript typecheck.

## Getting Started

```bash
npm install
docker compose up -d
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Copy `.env.example` to `.env` and update values before running the app with a real database.

Local links:

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/health`

Demo account after seed:

- Email: `demo@example.com`
- Password: `Demo@123456`

## File Storage

The app supports two upload drivers:

- `STORAGE_DRIVER=local` stores files in the local upload directory for development.
- `STORAGE_DRIVER=cloudinary` uploads files to Cloudinary and returns public media URLs.

Required Cloudinary environment variables:

```env
STORAGE_DRIVER=cloudinary
UPLOAD_MAX_BYTES=104857600
UPLOAD_CHUNK_BYTES=2097152
UPLOAD_TMP_DIR=uploads/.chunks
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=discord-clone/uploads
```

Files larger than 5 MB are uploaded from the browser in 2 MB chunks through
`POST /uploads/chunks`. The API writes chunks to a temporary directory, assembles
them when complete, then stores the final file locally or sends it to Cloudinary
with a large-upload path.

## End-to-End Encryption

The web client supports optional per-channel message encryption:

- Open the lock icon in the chat toolbar and enter a shared channel passphrase.
- Outgoing message text is encrypted in the browser before it is sent to the API.
- The backend stores the encrypted ciphertext in `Message.content`.
- Other members must enter the same passphrase in that channel to decrypt messages locally.

Current limits:

- Passphrases are session-local and are not synced across devices.
- Key exchange is manual; share passphrases outside the app with trusted members.
- Attachments, including voice messages, metadata, authorship, timestamps, reactions, and channel membership are not E2EE.
- This is not a full Signal-style multi-device protocol yet; adding public-key identity, member key rotation, and recovery is a future hardening step.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run format
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
```

## Project Guidance

- See `AGENT.md` for implementation guidance.
- See `RULE.md` for product, permission, messaging, and realtime rules.
- See `docs/architecture.md` for architecture notes.
- See `docs/security-check.md` for security and rate-limit checks.
- See `docs/deployment.md` for Vercel, Render, Cloudinary, and GitHub Actions deployment setup.
- See `docs/design-rules.md` and `docs/ui-design-spec.md` for UI direction.
- See `IMPLEMENTATION_PLAN.md` for the sprint roadmap and test links.
