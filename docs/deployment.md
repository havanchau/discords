# Deployment Guide

This project is split into a static Vite web app and a long-running NestJS API with Socket.IO.

Recommended production layout:

- Web: Vercel
- API: Render Web Service
- Database: Render PostgreSQL
- Media storage: Cloudinary
- CI/CD: GitHub Actions

## 1. Render API

Create a Render project with two resources:

- Render PostgreSQL database
- Render Web Service connected to this GitHub repository

API service settings:

- Runtime: Docker
- Dockerfile path: `apps/api/Dockerfile`
- Build context / root directory: repository root
- Branch: `main`
- Health check path: `/health`
- Auto-deploy: optional. If using GitHub Actions deploy hooks, keep auto-deploy off to avoid double deploys.

Render API variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<Render PostgreSQL External Database URL or Internal Database URL>
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=15m
TWO_FACTOR_ENCRYPTION_KEY=replace-with-at-least-32-random-characters
WEB_ORIGIN=https://your-vercel-domain.vercel.app,https://*.vercel.app
STORAGE_DRIVER=cloudinary
UPLOAD_MAX_BYTES=104857600
VOICE_MAX_BYTES=26214400
UPLOAD_CHUNK_BYTES=2097152
UPLOAD_TMP_DIR=uploads/.chunks
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=discord-clone/uploads
```

For the first deploy, initialize the production schema against the Render database:

```bash
npm run db:push --workspace apps/api
```

Run that command locally with `DATABASE_URL` pointed at Render, or use a one-off Render shell/job. For mature production releases, replace `db:push` with Prisma migrations and use:

```bash
npm exec --workspace apps/api -- prisma migrate deploy
```

Current schema update note:

- The latest sprint adds the `MessagePin` table for server-backed pinned messages.
- The latest follow-up adds channel permission overrides, persistent read states, notification preferences, and audit logs.
- Before deploying the API commit that uses these tables, run one of these against the live Render database:

```bash
npm run db:push --workspace apps/api
```

or apply the included SQL migration:

```bash
npm exec --workspace apps/api -- prisma migrate deploy
```

If the live database was originally created with `db:push` and does not have Prisma migration history, prefer `db:push` for this release.

Discord parity release (2026-09-15) schema and configuration notes:

- New migrations, in order: `20260915000000_add_user_blocks` (also converts legacy `BLOCKED` friend requests into blocks), `20260915001000_add_dm_message_actions`, `20260915002000_add_group_dms`, `20260915003000_add_server_bans`, `20260915004000_add_timeout_and_slowmode`, `20260915005000_add_channel_categories`, `20260915006000_add_server_emojis`, `20260915007000_add_password_reset_tokens`, `20260915008000_add_session_activity`, `20260915009000_add_two_factor_auth`, `20260915010000_add_server_events`.
- Apply them before deploying the API. On a large `Message` table, build `Message_channelId_authorId_createdAt_idx` with `CREATE INDEX CONCURRENTLY` first.
- `TWO_FACTOR_ENCRYPTION_KEY` is required in production (at least 32 characters); the API refuses to start without it. Keep it stable: rotating it invalidates enrolled authenticators.
- Verification and password reset emails need `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`; `WEB_ORIGIN`'s first non-wildcard origin is used in the links. Without SMTP in production, new accounts cannot be verified.
- Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` = the Gmail address, `SMTP_PASS` = a Google App Password (requires 2-Step Verification), `SMTP_FROM` = the same Gmail address. Roughly 500 recipients/day on a personal account.
- `POST /auth/register` no longer returns `verificationToken`/`verificationUrl`; deploy the API and web together.
- Link previews need outbound HTTP/HTTPS egress from the API host.

Google and Facebook sign-in (see `docs/features/oauth-login.md`):

- Run migration `20260916000000_add_oauth_accounts` before deploying the API.
- Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` and/or `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET`; a provider without both stays disabled on the sign-in screen.
- Set `OAUTH_REDIRECT_BASE_URL` to the API's public base URL (the API will not start in production without it once a provider is configured) and register `{OAUTH_REDIRECT_BASE_URL}/auth/oauth/google/callback` and `…/facebook/callback` in the provider consoles.
- Outbound HTTPS from the API to `oauth2.googleapis.com`, `openidconnect.googleapis.com`, and `graph.facebook.com` is required.

Account deletion and data export (see `docs/features/account-deletion-and-export.md`):

- Run migration `20260917007000_add_account_deletion_and_export` before deploying the API, and deploy the web client in the same release (the sign-in screen's cancel flow uses the new `POST /auth/account-deletion/cancel`).
- Optional `PRIVATE_STORAGE_LOCAL_DIR` (local storage driver only, default `<os tmpdir>/discord-clone-private`): where export archives are written. It must not be the public `uploads` directory. With `STORAGE_DRIVER=cloudinary`, exports reuse the `CLOUDINARY_*` settings as `authenticated` raw resources.
- The deletion and export-expiry sweep starts with the API process every 60 seconds; no separate worker.

DDoS and abuse protection (see `docs/features/ddos-protection.md`):

- Optional API variables, defaults shown: `TRUST_PROXY_HOPS=1`, `RATE_LIMIT_GLOBAL_PER_MINUTE=600`, `SOCKET_MAX_CONNECTIONS_PER_IP=50`. `TRUST_PROXY_HOPS` must equal the number of proxies in front of the API (Render: 1); an invalid value stops the API at startup.
- Expose the API only through its proxy. With the API port reachable directly, a client controls the address used for rate limiting.
- For volumetric DDoS, rely on Render's edge or put the API domain behind Cloudflare with rate-limiting rules for `/auth/*`.

## 2. Vercel Web

Create a Vercel project connected to this GitHub repository.

Project settings:

- Framework preset: Vite
- Root directory: repository root
- Install command: `npm ci`
- Build command: `npm run build --workspace apps/web`
- Output directory: `apps/web/dist`

If Root Directory is `apps/web`, use the app-local `vercel.json`: install from
the repository root with `npm ci --prefix ../..`, build with `npm run build`,
and output to `dist`. Enable **Include source files outside of the Root
Directory in the Build Step** because TypeScript and Vite use `packages/shared`
and the root TypeScript configuration. Clear dashboard command overrides that
still use `--workspace apps/web` from inside the app directory.

Vercel build repair checklist:

- [x] Add explicit install commands and configuration for both supported root directories.
- [x] Verify both configured build commands locally.
- [x] Run `vercel build --prod` with the linked project's settings and environment.
      Verified on 2026-10-10 with CLI 62.7.0 against
      `havanchaus-projects/discords-web` (Root Directory: `apps/web`): clean install,
      TypeScript, Vite, and Vercel output generation passed. Production
      `VITE_API_URL` and `VITE_SOCKET_URL` were pulled as sensitive placeholders,
      so this verifies compilation, not live API connectivity. No deployment was made.

Vercel variables:

```env
VITE_API_URL=https://your-render-api-domain.onrender.com
VITE_SOCKET_URL=https://your-render-api-domain.onrender.com
```

After the Vercel URL is known, update Render `WEB_ORIGIN` to the Vercel production URL and redeploy the API. You can include multiple comma-separated origins; `https://*.vercel.app` is supported for Vercel preview deployments.

## 3. GitHub Actions Secrets

The deploy workflow expects these repository secrets:

```env
RENDER_API_DEPLOY_HOOK_URL=
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
PRODUCTION_API_URL=
PRODUCTION_WEB_URL=
```

Where to find them:

- `RENDER_API_DEPLOY_HOOK_URL`: Render API service settings, Deploy Hook URL.
- `VERCEL_TOKEN`: Vercel account tokens.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: Vercel project settings or `.vercel/project.json` after linking locally.
- `PRODUCTION_API_URL`: deployed Render API origin, for example `https://your-api.onrender.com`.
- `PRODUCTION_WEB_URL`: deployed Vercel web origin, for example `https://your-app.vercel.app`.

## 4. Deployment Flow

Pull request:

```text
lint -> typecheck -> build
```

Manual production deploy:

```text
GitHub Actions -> Deploy workflow -> Render API deploy hook -> Vercel Web -> deployed UI smoke test
```

The deploy workflow can be run from GitHub Actions with `workflow_dispatch`. After the web deploy finishes, the workflow runs `npm run ui:smoke` against `PRODUCTION_WEB_URL` and `PRODUCTION_API_URL`, so keep the demo user from `apps/api/prisma/seed.ts` available in the target environment or update the smoke fixture credentials before enabling production gates.

## 5. Notes

- Do not commit `.env`.
- Cloudinary secrets belong only to the API service, not the Vercel frontend.
- Vite variables are baked into the static bundle at build time. Redeploy web after changing `VITE_*` values.
- `REDIS_URL` is required. The API refuses to boot without a reachable Redis, because presence, call membership, DM call rings and rate limits are shared through it.
- Socket.IO runs on the Redis adapter, so the API is no longer limited to one instance by its realtime layer. Uploads are: they still write to instance-local disk, so keep one instance until upload storage is shared or fully on Cloudinary.
- If the API URL changes, update both `VITE_API_URL` and `VITE_SOCKET_URL`.
