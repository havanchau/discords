# Discord Clone

Real-time Discord-style chat application built as a full-stack TypeScript monorepo with React, NestJS, Prisma, PostgreSQL, Socket.IO, and media upload support.

## What This Project Demonstrates

- Authenticated realtime server/channel chat.
- Discord-like app shell with server rail, channel sidebar, chat timeline, composer, and member sidebar.
- Role-based permissions for server, channel, message, invite, voice, and upload actions.
- Message replies, reactions, edits, soft deletes, pins, unread counts, and typing indicators.
- File, image, video, and voice-message uploads with local and Cloudinary storage support.
- WebRTC signaling foundation for voice, video, and screen-share flows.
- Optional browser-side channel passphrase encryption for message text.
- Security-minded API setup with DTO validation, guarded routes, rate limiting, Helmet, CORS, and upload allowlists.

## Tech Stack

| Area           | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Web            | React, Vite, TypeScript, Socket.IO client, lucide-react      |
| API            | NestJS, TypeScript, Prisma, PostgreSQL, Socket.IO, JWT       |
| Shared package | TypeScript contracts, schemas, permissions, realtime events  |
| Storage        | Local uploads for development, Cloudinary for hosted media   |
| Tooling        | npm workspaces, Docker Compose, ESLint, TypeScript, Prettier |

## Repository Layout

```text
apps/web          React/Vite web client
apps/api          NestJS API and Prisma schema
packages/shared   Shared types, schemas, permissions, realtime contracts
docs              Architecture, security, deployment, and UI docs
scripts           Local smoke checks and helper scripts
```

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

Local URLs:

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/health`

Seed demo account:

- Email: `demo@example.com`
- Password: `Demo@123456`

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run format
npm run format:check
npm run check:file-size
npm run docs:check
npm run ui:smoke
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
```

## File Storage

The API supports two upload drivers:

- `STORAGE_DRIVER=local`: stores files in the local upload directory for development.
- `STORAGE_DRIVER=cloudinary`: uploads hosted media to Cloudinary.

Cloudinary configuration:

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

Files larger than 5 MB are uploaded in chunks through the upload API, assembled by the backend, then stored with the configured storage driver.

## Optional Message Encryption

The web client supports optional per-channel passphrase encryption for message text:

- Users enter a shared channel passphrase from the chat toolbar.
- The browser encrypts outgoing message text before sending it to the API.
- The API stores ciphertext and cannot decrypt message bodies without the passphrase.
- Other members must enter the same passphrase in that channel to decrypt messages locally.

Current limits:

- Passphrases are session-local.
- Key exchange is manual.
- Attachments and metadata are not encrypted.
- This is not a full multi-device end-to-end encryption protocol.

## Documentation Map

- `RULE.md`: product invariants and backend rules.
- `AGENT.md`: implementation guidance for AI or human coding agents.
- `docs/feature-spec.md`: product scope and feature checklist.
- `docs/implementation-plan.md`: sprint plan and definition of done.
- `docs/markdown-structure.md`: Markdown structure rules and docs validation.
- `docs/README.md`: documentation index.
- `docs/architecture.md`: repository architecture and service boundaries.
- `docs/security-check.md`: security checklist.
- `docs/deployment.md`: Render, Vercel, Cloudinary, and GitHub Actions deployment.
- `docs/design-rules.md`: canonical UI implementation rules.
- `docs/ui-design-spec.md`: short UI product summary.

## Current Backlog

- Realtime direct messages.
- Friend-system polish.
- Message search.
- Member-level channel overrides.
- Notification inbox.
- Full moderation suite.
- Production CI smoke tests against deployed URLs.
