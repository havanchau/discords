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
WEB_ORIGIN=https://your-vercel-domain.vercel.app,https://*.vercel.app
STORAGE_DRIVER=cloudinary
UPLOAD_MAX_BYTES=104857600
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
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
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
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

If the live database was originally created with `db:push` and does not have Prisma migration history, prefer `db:push` for this release.

## 2. Vercel Web

Create a Vercel project connected to this GitHub repository.

Project settings:

- Framework preset: Vite
- Root directory: repository root
- Install command: `npm ci`
- Build command: `npm run build --workspace apps/web`
- Output directory: `apps/web/dist`

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
UI_SMOKE_EMAIL=
UI_SMOKE_PASSWORD=
```

Where to find them:

- `RENDER_API_DEPLOY_HOOK_URL`: Render API service settings, Deploy Hook URL.
- `VERCEL_TOKEN`: Vercel account tokens.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: Vercel project settings or `.vercel/project.json` after linking locally.
- `PRODUCTION_API_URL`: deployed Render API origin, for example `https://your-api.onrender.com`.
- `PRODUCTION_WEB_URL`: deployed Vercel web origin, for example `https://your-app.vercel.app`.
- `UI_SMOKE_EMAIL`: verified production smoke-test account email.
- `UI_SMOKE_PASSWORD`: production smoke-test account password.

## 4. Deployment Flow

Pull request:

```text
lint -> typecheck -> build
```

Manual production deploy:

```text
GitHub Actions -> Deploy workflow -> Render API deploy hook -> Vercel Web -> deployed UI smoke test
```

The deploy workflow can be run from GitHub Actions with `workflow_dispatch`. Deploys triggered by the CI `workflow_run` event run only after CI succeeds. After the web deploy finishes, the workflow runs `npm run ui:smoke` against `PRODUCTION_WEB_URL` and `PRODUCTION_API_URL` when those URL secrets and `UI_SMOKE_EMAIL`/`UI_SMOKE_PASSWORD` are configured. If the smoke-test secrets are missing, the deployment still completes and the smoke step is skipped with a GitHub Actions notice.

## 5. Notes

- Do not commit `.env`.
- Cloudinary secrets belong only to the API service, not the Vercel frontend.
- Vite variables are baked into the static bundle at build time. Redeploy web after changing `VITE_*` values.
- Keep the API to one instance until Socket.IO is configured with a Redis adapter.
- If the API URL changes, update both `VITE_API_URL` and `VITE_SOCKET_URL`.
