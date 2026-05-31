# Discord Clone

Real-time Discord-style chat application built as a full-stack monorepo with React, NestJS, Prisma, PostgreSQL, Socket.IO, and object-storage-ready file uploads.

## Project Highlights

- Real-time server/channel chat with Socket.IO rooms, typing indicators, reactions, replies, message editing, and soft delete.
- Discord-like workspace UI with server rail, channel sidebar, member list, upload previews, link previews, and responsive app-shell layout.
- Role-based permissions for server/channel actions, including manage roles, manage channels, send messages, create invites, connect voice, and upload files.
- Voice/video/screen-share call foundation using WebRTC signaling over the realtime gateway, plus recorded voice messages in chat.
- Auth flow with JWT access tokens, refresh tokens, email verification support, profile editing, and avatar updates.
- File, image, and video uploads with local development storage plus Cloudinary support for hosted media delivery.
- Optional channel passphrase E2EE for text messages using browser Web Crypto AES-GCM; the backend stores ciphertext and cannot decrypt message bodies without the passphrase.
- Security-focused backend hardening: DTO validation, upload type allowlist, rate limiting, Helmet/CORS setup, and guarded private endpoints.
- Maintainable frontend structure: `AppShell` is split into focused components and hooks such as chat panel, settings modal, workspace sidebar, member sidebar, and channel call hook.

## Feature Roadmap

Recently added:

- Active screen-share and call banner in text channels, including receive-only `Join stream`.
- Named typing indicators, so the composer can show who is typing instead of a generic message.
- Channel unread indicators and mention badges for visited channels.
- Local pinned-message panel from the notifications toolbar.
- Image and video preview overlay for message attachments.
- Voice message recording from the composer with inline audio playback.
- Auth-screen visual polish, motion, and responsive background treatment.

Recommended next features:

- Direct Messages: 1:1 conversation list, realtime DM room, unread DM count, and a focused DM chat surface.
- Friends: friend requests, accept/decline/block flows, and friend-scoped presence.
- Persistent read state: store last-read message per channel/user in PostgreSQL instead of keeping unread UI state client-side.
- Persistent pinned messages: promote the current local pin UI into a server-backed pin table with permission checks.
- Channel permission overrides: allow roles/members to override `VIEW_CHANNEL`, `SEND_MESSAGES`, and voice permissions per channel.
- Voice channel occupancy: show joined users under voice channels and allow joining the voice channel directly from the sidebar.
- Notification settings: mute server/channel, only mentions, desktop notifications, and notification inbox.
- Deployment hardening: production migrations, health checks for Render, seed-safe demo data, and CI smoke tests against deployed URLs.

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
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=discord-clone/uploads
```

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
