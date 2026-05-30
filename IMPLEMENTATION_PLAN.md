# Discord Clone - Implementation Plan

Plan này bám theo `AGENT.md`, `RULE.md` và `discord-clone-feature-spec.md`. Mục tiêu là đi từ nền tảng kỹ thuật đến MVP demo được, sau đó mở rộng bằng permission, DM, voice/video và production polish.

## Quy Ước Chung

Stack triển khai đề xuất:

- Monorepo: `apps/web`, `apps/api`, `packages/shared`
- Frontend: React + Vite + TypeScript + Tailwind CSS + TanStack Query + Zustand
- Backend: NestJS + TypeScript + PostgreSQL + Prisma + Socket.IO + JWT
- Infra: Docker Compose cho PostgreSQL, Redis, web, api
- Realtime: Socket.IO rooms theo server, channel, conversation
- Validation: Zod ở shared package, class-validator hoặc DTO validation ở NestJS
- Test: unit test service quan trọng, integration test API, E2E cho core user flows

## Sprint 0 - Foundation

Thời lượng đề xuất: 2-3 ngày

Mục tiêu:

- Chốt cấu trúc monorepo.
- Setup frontend, backend, shared package.
- Setup Docker Compose cho PostgreSQL và Redis.
- Setup Prisma, env validation, lint, format, typecheck.
- Tạo health check API và trang web shell đầu tiên.

Deliverables:

- `apps/web` chạy được ở `http://localhost:5173`
- `apps/api` chạy được ở `http://localhost:3000`
- `GET /health` trả trạng thái API, database, redis
- Prisma migrate chạy được
- CI local scripts: lint, typecheck, test

Acceptance criteria:

- `npm run lint` pass.
- `npm run typecheck` pass.
- `docker compose up` khởi động PostgreSQL và Redis.
- Health endpoint trả `ok`.

Test link:

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/health`

## Sprint 1 - Auth + User Profile

Thời lượng đề xuất: 5-7 ngày

Mục tiêu:

- Register, login, logout, refresh token.
- Hash password bằng argon2 hoặc bcrypt.
- JWT access token ngắn hạn, refresh token lưu hash trong database.
- User profile cơ bản.
- Protected API guard.

Deliverables:

- Auth pages: login, register.
- API: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me`.
- User API: `/users/me`, `PATCH /users/me`.
- Frontend session store và request interceptor.
- Error/loading/unauthorized states.

Acceptance criteria:

- Email và username không trùng.
- Password không lưu plain text.
- Refresh token bị revoke khi logout.
- API private trả 401 khi không có token.
- Người dùng đăng nhập xong vào được app shell.

Test link:

- Register: `http://localhost:5173/register`
- Login: `http://localhost:5173/login`
- Current user API: `http://localhost:3000/auth/me`

## Sprint 2 - Server, Member, Channel Core

Thời lượng đề xuất: 7-10 ngày

Mục tiêu:

- Tạo server.
- Người tạo là owner.
- Tạo role `@everyone`.
- Tạo text channel mặc định `general`.
- Sidebar server, channel sidebar, member list cơ bản.
- Invite join server.

Deliverables:

- API: `/servers`, `/servers/:serverId`, `/servers/:serverId/channels`.
- API invite: tạo invite, xem invite, join bằng code.
- Database models: server, member, role, channel, invite.
- Web UI: create server modal, join server modal, server layout.

Acceptance criteria:

- User tạo server được và tự động thành owner.
- Server mới luôn có ít nhất một text channel.
- User không phải member không xem được server private data.
- Join invite idempotent nếu user đã là member.
- Channel name được normalize lowercase, URL-safe.

Test link:

- App shell: `http://localhost:5173/app`
- Server detail: `http://localhost:5173/servers/:serverId`
- Invite join: `http://localhost:5173/invite/:code`

## Sprint 3 - Realtime Text Chat MVP

Thời lượng đề xuất: 7-10 ngày

Mục tiêu:

- Socket auth.
- Join/leave channel room.
- Send realtime message.
- Load message history bằng cursor pagination.
- Edit/delete own message.
- Typing indicator.

Deliverables:

- API: `GET /channels/:channelId/messages`, `POST /channels/:channelId/messages`, `PATCH /messages/:messageId`, `DELETE /messages/:messageId`.
- Socket events: `message:create`, `message:created`, `message:update`, `message:updated`, `message:delete`, `message:deleted`, `typing:start`, `typing:stop`.
- UI: chat panel, message list, composer, edit/delete actions.

Acceptance criteria:

- Server persist message trước, emit sau.
- Chỉ member có quyền mới gửi/xem message.
- Message mới xuất hiện realtime ở hai browser tabs.
- Edit giữ nguyên `createdAt` và cập nhật `editedAt`.
- Delete dùng soft delete và không phá lịch sử chat.
- Infinite scroll không load toàn bộ message cùng lúc.

Test link:

- Channel chat: `http://localhost:5173/servers/:serverId/channels/:channelId`
- Message API: `http://localhost:3000/channels/:channelId/messages`

## Sprint 4 - Role & Permission System

Thời lượng đề xuất: 7-10 ngày

Mục tiêu:

- Permission backend là source of truth.
- Role CRUD.
- Assign/remove role cho member.
- Permission guard cho server, channel, message, invite.
- Basic moderation: delete message người khác, kick member.

Deliverables:

- Permission constants trong `packages/shared`.
- API role: `/servers/:serverId/roles`, `/roles/:roleId`.
- API member role: add/remove member role.
- Permission service và guard testable.
- UI: role settings, member management cơ bản.

Acceptance criteria:

- Owner có toàn quyền.
- User không có `channel.manage` không tạo/xóa channel được.
- User không có `message.manage` không xóa message người khác được.
- Không kick owner.
- Permission check có unit test.

Test link:

- Server settings: `http://localhost:5173/servers/:serverId/settings`
- Role settings: `http://localhost:5173/servers/:serverId/settings/roles`
- Member settings: `http://localhost:5173/servers/:serverId/settings/members`

## Sprint 5 - Better Chat: Upload, Reply, Reaction, Mention, Unread

Thời lượng đề xuất: 7-10 ngày

Mục tiêu:

- File upload trong message.
- Image preview và file download có permission check.
- Reply message.
- Reaction emoji.
- Mention user/role/everyone.
- Unread count và mention badge.

Deliverables:

- Upload module local storage dev.
- Database: attachments, reactions, read states, notifications.
- Parser mention.
- UI: file preview, reply preview, reaction bar, unread badges.

Acceptance criteria:

- File type và size được validate server-side.
- Private channel file không tải được nếu không có quyền.
- Mention tạo notification đúng người.
- Reaction add/remove idempotent.
- Unread count cập nhật khi đọc channel.

Test link:

- Upload trong chat: `http://localhost:5173/servers/:serverId/channels/:channelId`
- Notifications: `http://localhost:5173/notifications`

## Sprint 6 - DM + Friends + Presence

Thời lượng đề xuất: 7-10 ngày

Mục tiêu:

- Friend request.
- Friend list.
- DM 1-1 realtime.
- Block user.
- Presence online/offline/idle/dnd/invisible.

Deliverables:

- API friends: request, accept, decline, block.
- API DM: create conversation, list conversations, messages.
- Socket rooms cho conversation.
- Presence service dùng Redis hoặc in-memory cho dev.
- UI: friends page, DM list, DM chat.

Acceptance criteria:

- Chỉ participants đọc được DM.
- User bị block không gửi DM/friend request.
- Presence broadcast tới friend/server members hợp lệ.
- Reconnect refetch state từ API.

Test link:

- Friends: `http://localhost:5173/friends`
- DM: `http://localhost:5173/dm/:conversationId`

## Sprint 7 - Voice, Video, Screen Share

Thời lượng đề xuất: 10-14 ngày

Mục tiêu:

- Voice channel join/leave.
- WebRTC signaling bằng Socket.IO.
- DM video call 1-1.
- Screen sharing.
- Call log.

Deliverables:

- Socket events: `voice:join`, `voice:leave`, `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `call:start`, `call:accept`, `call:end`.
- Voice state model.
- Call log model.
- UI: voice controls, incoming call modal, video call screen.
- STUN config dev, TURN config production-ready.

Acceptance criteria:

- Chỉ user có `CONNECT_VOICE` join voice được.
- Signaling chỉ gửi tới participant hợp lệ.
- Mute/deafen state broadcast realtime.
- Video call 1-1 hoạt động giữa hai browser profiles.
- Screen share start/stop rõ ràng.

Test link:

- Voice channel: `http://localhost:5173/servers/:serverId/channels/:voiceChannelId`
- Video call: `http://localhost:5173/dm/:conversationId/call`

## Sprint 8 - Production, Testing, Portfolio Polish

Thời lượng đề xuất: 7-10 ngày

Mục tiêu:

- Docker production.
- CI/CD.
- Rate limiting.
- Logging, global error handling.
- Seed demo data.
- README portfolio, screenshots, architecture diagram.
- E2E test core flows.

Deliverables:

- Dockerfile web/api.
- `docker-compose.yml` production-like.
- GitHub Actions: lint, typecheck, test, build.
- Seed script với demo account.
- README có demo URL, account demo, screenshots.
- E2E: register/login, create server, send realtime message.

Acceptance criteria:

- Demo online chạy được.
- Demo account dùng được.
- CI pass trên GitHub.
- Local seed tạo đủ dữ liệu demo.
- README đủ hướng dẫn chạy local và production.

Test link:

- Local web: `http://localhost:5173`
- Local API: `http://localhost:3000`
- Production demo: `https://your-demo-domain.example`

## Milestone Demo

MVP demo đầu tiên nên chốt sau Sprint 3.

Demo flow:

1. Register 2 tài khoản.
2. Login ở 2 browser khác nhau.
3. Tài khoản A tạo server.
4. A tạo invite.
5. B join server bằng invite.
6. A và B gửi message realtime trong `#general`.
7. A edit message của mình.
8. A delete message của mình.
9. Reload app và thấy message history vẫn còn đúng.

Link demo local cho MVP:

- Browser A: `http://localhost:5173/login`
- Browser B hoặc incognito: `http://localhost:5173/login`

## Test Strategy

Backend unit tests:

- Auth service: hash password, login, refresh, revoke.
- Permission service: owner/admin/member/no-access cases.
- Message service: create/edit/delete, membership required.
- Invite service: expired invite, max uses, already joined.

Backend integration tests:

- Auth API flow.
- Server creation transaction.
- Channel message pagination.
- Permission-protected endpoints.

Socket tests:

- Authenticated connection.
- Unauthorized connection rejected.
- Channel room join validates membership.
- Message emit broadcasts only to authorized room members.

Frontend tests:

- Auth form validation.
- Server/channel empty states.
- Chat composer disabled states.
- Message action visibility based on permission.

E2E tests:

- Register/login.
- Create server.
- Join invite.
- Realtime message in two browser contexts.
- Permission denial for restricted action.

## Risk Register

- Scope quá lớn: giữ Sprint 1-3 là MVP bắt buộc, các sprint sau là nâng cấp.
- Permission phức tạp: viết permission service sớm và test kỹ.
- Realtime race condition: persist trước, emit sau, client reconcile theo server IDs.
- WebRTC khó debug: làm voice signaling sau khi chat realtime đã ổn định.
- Deploy trễ: Docker Compose nên có từ Sprint 0 để giảm rủi ro production.

## Definition Of Done

Một sprint chỉ được coi là xong khi:

- Feature chính chạy được từ UI.
- API có validation và error states rõ.
- Permission backend đã được kiểm tra.
- Realtime event không leak data cho user không có quyền.
- Typecheck và lint pass.
- Test quan trọng của sprint pass.
- README hoặc docs được cập nhật nếu có thay đổi setup.
