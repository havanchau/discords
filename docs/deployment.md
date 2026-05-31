# Deployment Guide

This project is split into a static Vite web app and a long-running NestJS API with Socket.IO.

Recommended production layout:

- Web: Vercel
- API: Railway
- Database: Railway PostgreSQL
- Media storage: Cloudinary
- CI/CD: GitHub Actions

## 1. Railway API

Create a Railway project with two services:

- PostgreSQL database
- API service connected to this GitHub repository

API service settings:

- Builder: Dockerfile
- Dockerfile path: `apps/api/Dockerfile`
- Root directory: repository root
- Health check path: `/health`

Railway API variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=15m
WEB_ORIGIN=https://your-vercel-domain.vercel.app
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=discord-clone/uploads
```

For the first deploy, initialize the production schema against the Railway database:

```bash
railway run npm run db:push --workspace apps/api
```

For mature production releases, replace `db:push` with Prisma migrations and use:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

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
VITE_API_URL=https://your-railway-api-domain.up.railway.app
VITE_SOCKET_URL=https://your-railway-api-domain.up.railway.app
```

After the Vercel URL is known, update Railway `WEB_ORIGIN` to the Vercel production URL and redeploy the API.

## 3. GitHub Actions Secrets

The deploy workflow expects these repository secrets:

```env
RAILWAY_TOKEN=
RAILWAY_PROJECT_ID=
RAILWAY_ENVIRONMENT=production
RAILWAY_API_SERVICE=
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
```

Where to find them:

- `RAILWAY_TOKEN`: Railway account settings or project token.
- `RAILWAY_PROJECT_ID`: Railway project settings.
- `RAILWAY_ENVIRONMENT`: usually `production`.
- `RAILWAY_API_SERVICE`: API service name or ID.
- `VERCEL_TOKEN`: Vercel account tokens.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: Vercel project settings or `.vercel/project.json` after linking locally.

## 4. Deployment Flow

Pull request:

```text
lint -> typecheck -> build
```

Manual production deploy:

```text
GitHub Actions -> Deploy workflow -> Railway API -> Vercel Web
```

The deploy workflow can be run from GitHub Actions with `workflow_dispatch`.

## 5. Notes

- Do not commit `.env`.
- Cloudinary secrets belong only to the API service, not the Vercel frontend.
- Vite variables are baked into the static bundle at build time. Redeploy web after changing `VITE_*` values.
- Keep the API to one instance until Socket.IO is configured with a Redis adapter.
- If the API URL changes, update both `VITE_API_URL` and `VITE_SOCKET_URL`.
