# Discord Clone

Real-time Discord-style chat application.

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
- See `IMPLEMENTATION_PLAN.md` for the sprint roadmap and test links.
