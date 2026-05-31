# Discord Clone

Real-time Discord-style chat application built as a full-stack monorepo with React, NestJS, Prisma, PostgreSQL, Socket.IO, and object-storage-ready file uploads.

## Project Highlights

- Real-time server/channel chat with Socket.IO rooms, typing indicators, reactions, replies, message editing, and soft delete.
- Discord-like workspace UI with server rail, channel sidebar, member list, upload previews, link previews, and responsive app-shell layout.
- Role-based permissions for server/channel actions, including manage roles, manage channels, send messages, create invites, connect voice, and upload files.
- Voice/video/screen-share call foundation using WebRTC signaling over the realtime gateway.
- Auth flow with JWT access tokens, refresh tokens, email verification support, profile editing, and avatar updates.
- File, image, and video uploads with local development storage plus Cloudinary support for hosted media delivery.
- Security-focused backend hardening: DTO validation, upload type allowlist, rate limiting, Helmet/CORS setup, and guarded private endpoints.
- Maintainable frontend structure: `AppShell` is split into focused components and hooks such as chat panel, settings modal, workspace sidebar, member sidebar, and channel call hook.

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
- See `docs/deployment.md` for Vercel, Railway, Cloudinary, and GitHub Actions deployment setup.
- See `docs/design-rules.md` and `docs/ui-design-spec.md` for UI direction.
- See `IMPLEMENTATION_PLAN.md` for the sprint roadmap and test links.
