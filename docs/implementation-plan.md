# Discord Clone Implementation Plan

This plan turns the product rules, feature scope, and architecture documents into a delivery sequence. It is intentionally implementation-oriented; detailed product behavior lives in `feature-spec.md`, and UI rules live in `design-rules.md`.

## Delivery Principles

- Keep Sprint 1 through Sprint 3 as the mandatory MVP.
- Treat backend permissions as the source of truth.
- Persist state before emitting realtime events.
- Prefer small vertical slices that work from UI to database.
- Update documentation when setup, architecture, or product behavior changes.

## Technical Baseline

| Area         | Choice                                                            |
| ------------ | ----------------------------------------------------------------- |
| Repository   | npm workspaces with `apps/web`, `apps/api`, and `packages/shared` |
| Web          | React, Vite, TypeScript, Socket.IO client                         |
| API          | NestJS, TypeScript, Prisma, PostgreSQL, Socket.IO                 |
| Shared code  | Types, schemas, permissions, realtime event contracts             |
| Local infra  | Docker Compose for PostgreSQL and service dependencies            |
| Auth         | JWT access tokens, refresh tokens, guarded private endpoints      |
| Storage      | Local uploads for development, Cloudinary-ready hosted media      |
| Verification | lint, typecheck, build, API tests, UI smoke tests                 |

## Sprint 0: Foundation

Goal: establish the monorepo, local services, shared package, and health checks.

Deliverables:

- Web app running at `http://localhost:5173`.
- API running at `http://localhost:3000`.
- `GET /health` returns API and database status.
- Prisma schema and local database workflow are usable.
- Root scripts cover lint, typecheck, build, and local development.

Acceptance criteria:

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- Local environment starts without manual code edits.

## Sprint 1: Auth and User Profile

Goal: support registration, login, current-user lookup, token refresh, logout, and basic profile editing.

Deliverables:

- Auth pages for register and login.
- API endpoints for register, login, refresh, logout, and current user.
- Guarded private API routes.
- User profile API for current-user updates.
- Clear loading, error, and unauthorized states in the web app.

Acceptance criteria:

- Email and username uniqueness is enforced.
- Passwords are never stored in plain text.
- Refresh tokens can be revoked.
- Private endpoints return consistent `401` responses without credentials.
- Successful login enters the app shell.

## Sprint 2: Servers, Members, and Channels

Goal: create the core Discord-like workspace model.

Deliverables:

- Server CRUD foundation.
- Server owner membership creation.
- Default `@everyone` role.
- Default `general` text channel.
- Invite creation and invite join flow.
- Server rail, channel sidebar, chat area, and member sidebar shell.

Acceptance criteria:

- Creating a server is transactional.
- A server always has at least one text channel.
- Non-members cannot read private server data.
- Joining an invite is idempotent for existing members.
- Channel names are normalized and safe for URLs.

## Sprint 3: Realtime Text Chat MVP

Goal: deliver persistent realtime text chat.

Deliverables:

- Socket authentication.
- Authorized channel-room join and leave.
- Cursor-paginated message history.
- Message create, edit, and soft delete.
- Typing indicators.
- Chat timeline and composer UI.

Acceptance criteria:

- Messages are persisted before realtime emission.
- Only authorized members can read or send in a channel.
- New messages appear in multiple browser sessions without refresh.
- Edits keep `createdAt` and update edit metadata.
- Soft deletes preserve conversation history.
- Pagination avoids loading the full channel history at once.

## Sprint 4: Roles and Permissions

Goal: make permissions explicit, reusable, and testable.

Deliverables:

- Permission constants in `packages/shared`.
- Permission service in the API.
- Role CRUD.
- Member role assignment and removal.
- Guards for server, channel, message, invite, and moderation actions.
- Basic role and member management UI.

Acceptance criteria:

- Owners have all permissions.
- Users without `channel.manage` cannot create, edit, or delete channels.
- Users without `message.manage` cannot moderate other users' messages.
- Owners cannot be kicked by non-owners.
- Permission behavior has focused automated tests.

## Sprint 5: Better Chat

Goal: make chat feel closer to a production communication app.

Deliverables:

- Message attachments with server-side validation.
- Image, video, audio, and file preview states.
- Replies.
- Reactions.
- Mentions.
- Unread counts and mention badges.
- Pinned messages.

Acceptance criteria:

- File type and size are validated server-side.
- Private channel attachments require authorization.
- Mentions notify the correct users.
- Reaction add/remove is idempotent.
- Read state updates when a channel is viewed.

## Sprint 6: Direct Messages, Friends, and Presence

Goal: add user-to-user communication and social state.

Deliverables:

- Friend request, accept, decline, and block flows.
- Friend list.
- One-to-one direct message conversations.
- Presence states: online, idle, do-not-disturb, invisible, offline.
- DM list and DM chat UI.

Acceptance criteria:

- Only conversation participants can read DMs.
- Blocked users cannot send DMs or friend requests.
- Presence is only broadcast to authorized viewers.
- Reconnect flows refetch missed state from the API.

## Sprint 7: Voice, Video, and Screen Share

Goal: build the WebRTC foundation for voice and video communication.

Deliverables:

- Voice channel join and leave.
- WebRTC signaling over Socket.IO.
- Mute, deafen, and active speaker states.
- One-to-one video call foundation.
- Screen-share start and stop.
- Call UI surfaces.

Acceptance criteria:

- Only users with voice permission can join voice channels.
- Signaling events are sent only to authorized participants.
- Mute and deafen states broadcast in realtime.
- Two browser profiles can complete a basic call.
- Screen share state is visible and recoverable.

## Sprint 8: Production and Portfolio Polish

Goal: make the project deployable, demonstrable, and maintainable.

Deliverables:

- Production Dockerfiles and deployment docs.
- GitHub Actions for lint, typecheck, build, and deploy.
- Rate limiting, CORS, Helmet, and global error handling.
- Demo seed data.
- README with local setup, production setup, demo account, and feature summary.
- UI smoke checks for core flows.

Acceptance criteria:

- Demo environment is reachable.
- Demo account works.
- CI passes on GitHub.
- Local seed creates enough data for a realistic demo.
- Documentation reflects the actual setup.

## MVP Demo Flow

The first public MVP should be cut after Sprint 3.

1. Register two accounts.
2. Log in from two different browser contexts.
3. Account A creates a server.
4. Account A creates an invite.
5. Account B joins through the invite.
6. Both accounts send realtime messages in `#general`.
7. Account A edits one own message.
8. Account A deletes one own message.
9. Refresh both browsers and verify message history remains correct.

## Test Strategy

Backend unit tests:

- Auth service: password hashing, login, refresh, revoke.
- Permission service: owner, admin, member, and no-access cases.
- Message service: create, edit, delete, membership required.
- Invite service: expired invite, max uses, already joined.

Backend integration tests:

- Auth API flow.
- Server creation transaction.
- Channel message pagination.
- Permission-protected endpoints.

Socket tests:

- Authenticated connection.
- Unauthorized connection rejection.
- Channel room join membership checks.
- Message broadcasts only to authorized room members.

Frontend and smoke tests:

- Auth form validation.
- Server and channel empty states.
- Chat composer disabled and pending states.
- Message action visibility by permission.
- Realtime message delivery in two browser contexts.

## Risk Register

| Risk                            | Mitigation                                                          |
| ------------------------------- | ------------------------------------------------------------------- |
| Scope grows beyond MVP          | Keep Sprint 1-3 mandatory and later sprints optional.               |
| Permissions become inconsistent | Centralize permission checks in the API and test them early.        |
| Realtime race conditions        | Persist first, emit second, reconcile by server IDs.                |
| WebRTC debugging consumes time  | Start voice/video only after text realtime is stable.               |
| Deployment slips late           | Keep Docker and deployment docs current from the foundation sprint. |

## Definition of Done

A sprint is complete only when:

- The main feature works from the UI.
- API input validation and error states are present.
- Backend permissions are checked.
- Realtime events do not leak data to unauthorized users.
- Typecheck, lint, and relevant tests pass.
- Documentation is updated when setup or behavior changes.
