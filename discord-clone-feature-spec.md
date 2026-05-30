# Discord Clone - Feature Specification & Roadmap

## 1. Mục tiêu dự án

Dự án này là một ứng dụng chat realtime lấy cảm hứng từ Discord, tập trung thể hiện năng lực Fullstack với các kỹ thuật quan trọng:

- Authentication & Authorization
- Realtime chat bằng WebSocket
- Database design với PostgreSQL
- Role/permission system
- File upload
- Notification
- Voice call / Video call bằng WebRTC
- Deployment production với Docker
- CI/CD
- Logging, monitoring, testing

Mục tiêu cuối cùng là tạo một project đủ ấn tượng để đưa vào CV, portfolio và GitHub.

---

## 2. Tech Stack đề xuất

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Zustand hoặc Redux Toolkit
- React Query / TanStack Query
- Socket.IO Client
- WebRTC APIs
- React Hook Form
- Zod
- shadcn/ui hoặc Radix UI

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM hoặc TypeORM
- Socket.IO Gateway
- JWT Authentication
- Passport.js
- Redis
- BullMQ hoặc NestJS Queue
- Multer hoặc S3-compatible upload

### DevOps

- Docker
- Docker Compose
- GitHub Actions
- Nginx
- Render / Railway / Fly.io / VPS
- PostgreSQL managed database hoặc container
- Redis managed service hoặc container

---

## 3. Các vai trò người dùng

### Guest

Người chưa đăng nhập.

Có thể:

- Xem trang landing page
- Đăng ký tài khoản
- Đăng nhập
- Xem demo public nếu có

Không thể:

- Tạo server
- Nhắn tin
- Tham gia voice/video call

### User

Người dùng đã đăng nhập.

Có thể:

- Tạo server
- Tham gia server qua invite link
- Tạo channel nếu có quyền
- Nhắn tin trong channel
- Gửi tin nhắn riêng
- Upload file
- Tham gia voice/video call
- Chỉnh sửa profile

### Server Owner

Người tạo server.

Có thể:

- Quản lý server
- Đổi tên server
- Đổi avatar server
- Tạo/sửa/xóa channel
- Tạo/sửa/xóa role
- Gán role cho member
- Kick/ban member
- Xóa tin nhắn trong server
- Tạo invite link
- Chuyển quyền owner nếu cần

### Admin / Moderator

Người có quyền quản lý trong server.

Có thể tùy theo permission:

- Quản lý channel
- Quản lý member
- Xóa tin nhắn
- Mute user
- Ban user
- Quản lý invite

---

## 4. Module Authentication

### 4.1 Đăng ký tài khoản

Người dùng có thể đăng ký bằng:

- Email
- Username
- Password

Yêu cầu:

- Email không được trùng
- Username không được trùng trong hệ thống hoặc có discriminator nếu muốn giống Discord cũ
- Password phải được hash bằng bcrypt hoặc argon2
- Validate email format
- Validate password strength

Thông tin lưu trong database:

- id
- email
- username
- displayName
- passwordHash
- avatarUrl
- status
- createdAt
- updatedAt

### 4.2 Đăng nhập

Người dùng đăng nhập bằng:

- Email + password

Sau khi đăng nhập:

- Backend trả access token
- Backend trả refresh token
- Frontend lưu token an toàn
- Tự động refresh token khi access token hết hạn

### 4.3 Đăng xuất

Khi logout:

- Xóa token phía client
- Có thể revoke refresh token phía server
- Cập nhật trạng thái offline nếu không còn session nào hoạt động

### 4.4 Refresh token

Yêu cầu:

- Access token thời gian ngắn
- Refresh token thời gian dài hơn
- Refresh token được lưu hash trong database
- Có endpoint `/auth/refresh`

### 4.5 OAuth Login

Có thể thêm ở giai đoạn sau:

- Google Login
- GitHub Login

Mục tiêu CV:

- Thể hiện khả năng tích hợp OAuth2
- Hữu ích cho trải nghiệm demo

---

## 5. Module User Profile

### 5.1 Xem profile cá nhân

Hiển thị:

- Avatar
- Display name
- Username
- Bio
- Online status
- Ngày tham gia
- Mutual servers

### 5.2 Chỉnh sửa profile

Người dùng có thể chỉnh:

- Display name
- Avatar
- Bio
- Password

Yêu cầu:

- Upload avatar
- Validate file type
- Validate file size
- Crop hoặc preview ảnh nếu muốn làm đẹp UI

### 5.3 Trạng thái người dùng

Các trạng thái:

- Online
- Offline
- Idle
- Do not disturb
- Invisible

Realtime:

- Khi user connect socket: online
- Khi disconnect: offline hoặc delay vài giây để tránh nhảy trạng thái liên tục
- Broadcast presence đến friends/server members

---

## 6. Module Server / Guild

Discord gọi là Guild, nhưng UI có thể gọi là Server.

### 6.1 Tạo server

Người dùng có thể tạo server với:

- Tên server
- Ảnh đại diện server
- Mô tả server

Sau khi tạo:

- Người tạo trở thành owner
- Tạo default role `@everyone`
- Tạo channel mặc định `general`
- Tạo category mặc định nếu cần

### 6.2 Danh sách server của user

Sidebar hiển thị:

- Các server user tham gia
- Avatar server
- Badge unread message
- Badge mention

### 6.3 Chi tiết server

Hiển thị:

- Tên server
- Danh sách channel
- Danh sách member
- Role của member
- Online/offline member

### 6.4 Cập nhật server

Owner hoặc user có quyền có thể sửa:

- Tên server
- Avatar
- Mô tả
- Cài đặt invite
- Cài đặt quyền mặc định

### 6.5 Xóa server

Chỉ owner có thể xóa server.

Yêu cầu:

- Confirm bằng modal
- Có thể yêu cầu nhập lại tên server
- Soft delete hoặc hard delete tùy thiết kế

---

## 7. Module Channel

### 7.1 Loại channel

Hỗ trợ các loại channel:

- Text channel
- Voice channel
- Announcement channel
- Private channel

Giai đoạn MVP nên làm:

- Text channel
- Voice channel

### 7.2 Tạo channel

Thông tin channel:

- id
- serverId
- name
- type
- categoryId
- position
- isPrivate
- createdAt
- updatedAt

Validate:

- Tên channel không rỗng
- Tên channel viết thường, không dấu, thay space bằng `-`
- Không trùng tên trong cùng category nếu muốn

### 7.3 Sửa channel

Có thể sửa:

- Tên channel
- Loại channel
- Category
- Permission override
- Topic

### 7.4 Xóa channel

Yêu cầu:

- Chỉ user có quyền mới được xóa
- Không cho xóa channel cuối cùng nếu muốn giữ server luôn có ít nhất một text channel

### 7.5 Sắp xếp channel

Tính năng nâng cao:

- Drag and drop channel
- Lưu position trong database
- Realtime update thứ tự channel cho mọi member

---

## 8. Module Category

### 8.1 Tạo category

Category dùng để nhóm channel.

Ví dụ:

- INFORMATION
- GENERAL
- DEVELOPMENT
- VOICE CHANNELS

### 8.2 Sửa category

Có thể sửa:

- Tên category
- Thứ tự hiển thị
- Permission override

### 8.3 Xóa category

Khi xóa category:

- Option 1: Xóa toàn bộ channel trong category
- Option 2: Di chuyển channel ra ngoài category

Khuyến nghị:

- MVP: chỉ cho xóa category rỗng
- Sau đó mới thêm modal chọn cách xử lý

---

## 9. Module Message

### 9.1 Gửi tin nhắn

User có thể gửi tin nhắn trong text channel.

Message gồm:

- id
- channelId
- serverId
- authorId
- content
- attachments
- replyToMessageId
- editedAt
- deletedAt
- createdAt

Realtime flow:

1. Client emit `message:create`
2. Backend validate quyền user
3. Backend lưu message vào PostgreSQL
4. Backend broadcast message đến room channel
5. Client update UI realtime

### 9.2 Hiển thị tin nhắn

UI cần có:

- Avatar người gửi
- Tên người gửi
- Nội dung
- Thời gian gửi
- File đính kèm
- Trạng thái đã chỉnh sửa
- Reply preview

### 9.3 Sửa tin nhắn

Điều kiện:

- Chỉ tác giả message được sửa
- Moderator không nên sửa nội dung của người khác

Sau khi sửa:

- Cập nhật `editedAt`
- Broadcast `message:update`

### 9.4 Xóa tin nhắn

Có hai loại:

- User xóa tin nhắn của chính họ
- Moderator xóa tin nhắn của người khác

Khuyến nghị:

- Soft delete bằng `deletedAt`
- Không hiển thị nội dung đã xóa
- Có thể log moderation action

### 9.5 Reply message

User có thể reply một message.

Hiển thị:

- Preview người được reply
- Một đoạn ngắn nội dung message gốc
- Click để scroll đến message gốc

### 9.6 Mention

Hỗ trợ mention:

- `@user`
- `@role`
- `@everyone`

Yêu cầu:

- Parse mention trong content
- Lưu mentions vào database nếu cần
- Gửi notification cho user bị mention
- Badge unread mention ở server/channel

### 9.7 Reaction emoji

User có thể react message bằng emoji.

Tính năng:

- Add reaction
- Remove reaction
- Count reaction
- Hiển thị danh sách user đã react

Database:

- messageId
- userId
- emoji
- createdAt

### 9.8 Pin message

User có quyền có thể pin message.

Tính năng:

- Pin/unpin message
- Xem danh sách pinned messages trong channel

### 9.9 Search message

Tìm kiếm tin nhắn theo:

- Keyword
- User
- Channel
- Date range

MVP:

- Search theo keyword trong một channel

Nâng cao:

- Full-text search PostgreSQL
- Elasticsearch / Meilisearch

### 9.10 Pagination / Infinite Scroll

Không load toàn bộ message một lúc.

Yêu cầu:

- Load 30-50 messages gần nhất
- Scroll lên thì load thêm
- Cursor-based pagination
- Giữ scroll position khi prepend message cũ

---

## 10. Module Direct Message

### 10.1 Tạo cuộc trò chuyện riêng

User có thể nhắn tin 1-1 với user khác.

DM gồm:

- conversationId
- participantIds
- lastMessageId
- createdAt
- updatedAt

### 10.2 Gửi DM

Tương tự message trong channel nhưng không thuộc server.

Realtime:

- Mỗi conversation là một socket room
- Chỉ participants được join room

### 10.3 Group DM

Tính năng nâng cao:

- Tạo nhóm chat nhỏ không thuộc server
- Thêm/xóa thành viên
- Đổi tên nhóm
- Đổi avatar nhóm

---

## 11. Module Friend System

### 11.1 Gửi lời mời kết bạn

User có thể gửi friend request bằng:

- Username
- Email
- User ID

Trạng thái:

- Pending
- Accepted
- Rejected
- Blocked

### 11.2 Chấp nhận / từ chối

User nhận request có thể:

- Accept
- Decline
- Block

### 11.3 Danh sách bạn bè

Hiển thị:

- All friends
- Online friends
- Pending requests
- Blocked users

### 11.4 Block user

Khi block:

- Không nhận DM
- Không nhận friend request
- Có thể ẩn message của người bị block trong server

---

## 12. Module Role & Permission

Đây là phần rất quan trọng để project ấn tượng.

### 12.1 Role

Mỗi server có nhiều role.

Role gồm:

- id
- serverId
- name
- color
- position
- permissions
- createdAt
- updatedAt

Default role:

- `@everyone`

### 12.2 Permission

Danh sách permission đề xuất:

- VIEW_CHANNEL
- SEND_MESSAGES
- MANAGE_MESSAGES
- MANAGE_CHANNELS
- MANAGE_SERVER
- MANAGE_ROLES
- KICK_MEMBERS
- BAN_MEMBERS
- CREATE_INVITE
- CONNECT_VOICE
- SPEAK_VOICE
- MUTE_MEMBERS
- DEAFEN_MEMBERS
- MENTION_EVERYONE
- UPLOAD_FILES

### 12.3 Gán role cho member

Owner/admin có thể:

- Add role cho member
- Remove role khỏi member
- Xem role hiện tại của member

### 12.4 Permission check

Backend phải check quyền ở mọi API quan trọng:

- Tạo channel
- Xóa channel
- Gửi message
- Xóa message
- Quản lý member
- Tạo invite
- Join voice channel

Không chỉ check ở frontend.

### 12.5 Permission override theo channel

Nâng cao:

- Mỗi channel có thể override quyền của role/member
- Ví dụ channel private chỉ cho role `Admin` xem

---

## 13. Module Invite

### 13.1 Tạo invite link

User có quyền có thể tạo invite.

Invite gồm:

- code
- serverId
- channelId
- creatorId
- maxUses
- usedCount
- expiresAt
- createdAt

### 13.2 Join server bằng invite

Flow:

1. User mở invite link
2. Backend kiểm tra invite còn hạn không
3. Backend kiểm tra user đã ở server chưa
4. Thêm user vào server
5. Redirect đến server/channel

### 13.3 Quản lý invite

Owner/admin có thể:

- Xem danh sách invite
- Xóa invite
- Xem người tạo invite
- Xem số lượt dùng

---

## 14. Module Voice Call

### 14.1 Voice channel

User click vào voice channel để tham gia.

Tính năng:

- Join voice channel
- Leave voice channel
- Mute/unmute mic
- Deafen/undeafen
- Hiển thị danh sách user đang trong voice channel

### 14.2 WebRTC signaling

Backend NestJS Socket.IO chỉ dùng làm signaling server.

Events:

- `voice:join`
- `voice:leave`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`
- `voice:mute`
- `voice:unmute`

### 14.3 STUN/TURN

Development:

- Dùng public STUN server

Production:

- Dùng TURN server riêng bằng coturn

Cần hiểu:

- STUN giúp client tìm public IP
- TURN relay media khi P2P không kết nối được

### 14.4 UI voice

Hiển thị:

- User đang trong voice channel
- Icon mic on/off
- Icon speaking indicator
- Nút disconnect
- Nút mute
- Nút deafen

---

## 15. Module Video Call

### 15.1 Video call trong DM

MVP nên làm video call 1-1 trong DM trước.

Tính năng:

- Start video call
- Accept call
- Decline call
- End call
- Toggle camera
- Toggle microphone
- Switch camera nếu mobile

### 15.2 Video call trong voice channel

Nâng cao:

- User trong voice channel có thể bật camera
- Hiển thị grid video
- Pin một user
- Fullscreen video

### 15.3 Screen sharing

Tính năng ấn tượng cho CV.

Yêu cầu:

- Dùng `getDisplayMedia`
- User có thể share màn hình
- Người khác xem màn hình realtime
- Stop sharing

### 15.4 Call state

Các trạng thái call:

- idle
- calling
- ringing
- accepted
- declined
- missed
- ended
- busy

Backend nên lưu call log:

- callerId
- receiverId
- status
- startedAt
- endedAt
- duration

---

## 16. Module Notification

### 16.1 In-app notification

Thông báo trong app cho:

- Friend request
- Mention
- DM mới
- Invite
- Call incoming

### 16.2 Unread count

Cần hiển thị:

- Unread server
- Unread channel
- Unread DM
- Mention count

Database có thể lưu:

- lastReadMessageId
- lastReadAt
- userId
- channelId/conversationId

### 16.3 Push notification

Nâng cao:

- Web Push Notification
- Firebase Cloud Messaging

Dùng cho:

- Tin nhắn mới khi user offline
- Incoming call
- Mention quan trọng

---

## 17. Module File Upload

### 17.1 Upload file trong message

Hỗ trợ:

- Image
- PDF
- ZIP
- Text file
- Video nhỏ nếu muốn

Yêu cầu:

- Validate file size
- Validate mime type
- Lưu metadata trong database
- Upload lên local storage trong dev
- Upload lên S3/R2/Supabase Storage trong production

### 17.2 Image preview

Nếu file là ảnh:

- Hiển thị thumbnail
- Click để mở modal preview

### 17.3 File download

User có thể tải file.

Yêu cầu:

- Check permission trước khi download nếu file nằm trong private channel

---

## 18. Module Moderation

### 18.1 Kick member

User có quyền có thể kick member khỏi server.

Yêu cầu:

- Không kick owner
- Không kick user có role cao hơn
- Ghi log moderation

### 18.2 Ban member

Ban member khỏi server.

Yêu cầu:

- Lưu danh sách banned users
- User bị ban không thể join lại bằng invite
- Có thể unban

### 18.3 Timeout / Mute

Nâng cao:

- Mute user trong một khoảng thời gian
- Không cho gửi message hoặc join voice tùy config

### 18.4 Audit log

Ghi lại các hành động quan trọng:

- Create channel
- Delete channel
- Update role
- Kick member
- Ban member
- Delete message
- Create invite

Audit log gồm:

- action
- actorId
- targetId
- serverId
- metadata
- createdAt

---

## 19. Module Settings

### 19.1 User settings

Người dùng có thể chỉnh:

- Theme light/dark
- Language
- Notification preferences
- Privacy settings
- Status visibility

### 19.2 Server settings

Owner/admin có thể chỉnh:

- Server name
- Server avatar
- Default channel
- Default role
- Invite policy
- Notification policy

---

## 20. Database Schema đề xuất

Các bảng chính:

- users
- sessions
- servers
- server_members
- roles
- member_roles
- permissions
- categories
- channels
- channel_permission_overrides
- messages
- message_attachments
- message_reactions
- direct_conversations
- direct_conversation_members
- direct_messages
- friends
- friend_requests
- invites
- voice_states
- call_logs
- notifications
- read_states
- bans
- audit_logs

### Quan hệ quan trọng

- User có nhiều Server thông qua ServerMember
- Server có nhiều Channel
- Server có nhiều Role
- ServerMember có nhiều Role
- Channel có nhiều Message
- Message thuộc về User
- Message có nhiều Attachment
- Message có nhiều Reaction
- User có nhiều DirectConversation thông qua DirectConversationMember

---

## 21. API REST đề xuất

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`

### Users

- `GET /users/me`
- `PATCH /users/me`
- `GET /users/:id`
- `POST /users/avatar`

### Servers

- `POST /servers`
- `GET /servers`
- `GET /servers/:serverId`
- `PATCH /servers/:serverId`
- `DELETE /servers/:serverId`

### Members

- `GET /servers/:serverId/members`
- `PATCH /servers/:serverId/members/:memberId`
- `DELETE /servers/:serverId/members/:memberId`
- `POST /servers/:serverId/members/:memberId/roles/:roleId`
- `DELETE /servers/:serverId/members/:memberId/roles/:roleId`

### Channels

- `POST /servers/:serverId/channels`
- `GET /servers/:serverId/channels`
- `GET /channels/:channelId`
- `PATCH /channels/:channelId`
- `DELETE /channels/:channelId`

### Messages

- `GET /channels/:channelId/messages`
- `POST /channels/:channelId/messages`
- `PATCH /messages/:messageId`
- `DELETE /messages/:messageId`
- `POST /messages/:messageId/reactions`
- `DELETE /messages/:messageId/reactions/:emoji`

### Direct Messages

- `POST /dm/conversations`
- `GET /dm/conversations`
- `GET /dm/conversations/:conversationId/messages`
- `POST /dm/conversations/:conversationId/messages`

### Invites

- `POST /servers/:serverId/invites`
- `GET /servers/:serverId/invites`
- `GET /invites/:code`
- `POST /invites/:code/join`
- `DELETE /invites/:inviteId`

### Roles

- `POST /servers/:serverId/roles`
- `GET /servers/:serverId/roles`
- `PATCH /roles/:roleId`
- `DELETE /roles/:roleId`

---

## 22. Socket Events đề xuất

### Connection

- `connect`
- `disconnect`
- `user:online`
- `user:offline`
- `presence:update`

### Server / Channel Room

- `server:join`
- `server:leave`
- `channel:join`
- `channel:leave`

### Messages

- `message:create`
- `message:created`
- `message:update`
- `message:updated`
- `message:delete`
- `message:deleted`
- `message:typing`
- `message:stop-typing`

### Reactions

- `reaction:add`
- `reaction:added`
- `reaction:remove`
- `reaction:removed`

### Direct Message

- `dm:join`
- `dm:message:create`
- `dm:message:created`
- `dm:typing`

### Voice / Video

- `voice:join`
- `voice:joined`
- `voice:leave`
- `voice:left`
- `call:start`
- `call:incoming`
- `call:accept`
- `call:accepted`
- `call:decline`
- `call:declined`
- `call:end`
- `call:ended`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`

### Notifications

- `notification:new`
- `notification:read`

---

## 23. UI Pages / Screens

### Public

- Landing page
- Login page
- Register page
- Forgot password page

### Main App

- Server layout
- Server sidebar
- Channel sidebar
- Chat panel
- Member sidebar
- User control panel

### Server

- Create server modal
- Join server modal
- Server settings page
- Role settings page
- Member management page
- Invite management page
- Audit log page

### Chat

- Channel message view
- DM message view
- Message input
- Emoji picker
- File upload preview
- Search modal
- Pinned messages modal

### Voice / Video

- Voice channel panel
- Incoming call modal
- Video call screen
- Screen share view
- Call controls

### User

- Profile page
- Edit profile modal
- Friends page
- Pending friend requests
- Settings page

---

## 24. MVP Scope

Để tránh quá lớn, nên chia thành nhiều giai đoạn.

### MVP 1: Core Auth + Server + Text Chat

Cần hoàn thành:

- Register/login/logout
- JWT auth
- Create server
- Join server bằng invite
- Create text channel
- Send realtime message
- Edit/delete own message
- Load message history
- Basic member list
- Basic user profile

Khi MVP 1 xong, project đã có thể demo.

### MVP 2: Role + Permission + Better Chat

Thêm:

- Role system
- Permission check backend
- Manage channels
- Manage members
- Message reaction
- Reply message
- Mention user
- Unread count
- File upload

### MVP 3: DM + Friend System

Thêm:

- Friend request
- Friend list
- Direct message 1-1
- DM realtime
- Block user
- Online status

### MVP 4: Voice / Video Call

Thêm:

- Voice channel
- WebRTC voice call
- DM video call 1-1
- Screen share
- Call log
- STUN/TURN config

### MVP 5: Production Polish

Thêm:

- Docker production
- CI/CD
- Unit test
- E2E test
- Monitoring
- Rate limiting
- Security hardening
- Demo seed data
- README chuyên nghiệp

---

## 25. Các điểm nên nhấn mạnh trong CV

Khi đưa project vào CV, không nên ghi chung chung là “Discord clone”.

Nên ghi:

```text
Built a fullstack Discord-like realtime collaboration platform using React, NestJS, PostgreSQL, Redis, Socket.IO and WebRTC.
```

Các bullet nên có:

- Implemented realtime messaging with Socket.IO, channel rooms, typing indicators and presence tracking.
- Designed PostgreSQL schema for servers, channels, members, roles, permissions, messages and direct conversations.
- Built role-based permission system with server-level and channel-level access control.
- Integrated WebRTC for 1-on-1 video calls, voice channels and screen sharing.
- Added JWT authentication with refresh tokens and secure password hashing.
- Implemented file uploads with validation, preview and permission-aware downloads.
- Containerized frontend, backend, PostgreSQL and Redis with Docker Compose.
- Deployed the app with CI/CD pipeline and production environment configuration.

---

## 26. Những tính năng giúp project nổi bật hơn clone thông thường

Nếu muốn project thật sự ấn tượng, ưu tiên làm các tính năng này:

1. Role-based permission system
2. WebRTC voice/video call
3. Screen sharing
4. Realtime presence
5. Redis adapter cho Socket.IO
6. Message search
7. Audit log
8. File upload với permission check
9. CI/CD + Docker production
10. Testing backend service quan trọng

---

## 27. Checklist hoàn thành dự án

### Backend

- [ ] Setup NestJS project
- [ ] Setup PostgreSQL
- [ ] Setup Prisma/TypeORM
- [ ] Setup Redis
- [ ] Auth module
- [ ] User module
- [ ] Server module
- [ ] Channel module
- [ ] Message module
- [ ] Role module
- [ ] Permission guard
- [ ] Invite module
- [ ] Friend module
- [ ] DM module
- [ ] Notification module
- [ ] File upload module
- [ ] Voice/video signaling gateway
- [ ] Rate limiting
- [ ] Validation pipe
- [ ] Global exception filter
- [ ] Logging
- [ ] Tests

### Frontend

- [ ] Setup React + Vite + TypeScript
- [ ] Setup Tailwind
- [ ] Auth pages
- [ ] Main layout
- [ ] Server sidebar
- [ ] Channel sidebar
- [ ] Chat UI
- [ ] Message input
- [ ] File upload UI
- [ ] Member sidebar
- [ ] Server settings
- [ ] Role settings
- [ ] Friends page
- [ ] DM page
- [ ] Voice channel UI
- [ ] Video call UI
- [ ] Screen sharing UI
- [ ] Notification UI
- [ ] Responsive design

### DevOps

- [ ] Dockerfile frontend
- [ ] Dockerfile backend
- [ ] docker-compose.yml
- [ ] Nginx config
- [ ] Environment variables
- [ ] GitHub Actions
- [ ] Production deploy
- [ ] Seed demo data
- [ ] README setup guide
- [ ] Architecture diagram

---

## 28. Gợi ý cấu trúc repository

```text
z-discord-clone/
  apps/
    web/
      src/
        components/
        pages/
        hooks/
        stores/
        services/
        socket/
        webrtc/
    api/
      src/
        modules/
          auth/
          users/
          servers/
          channels/
          messages/
          roles/
          invites/
          friends/
          dm/
          notifications/
          uploads/
          voice/
        common/
        config/
        main.ts
  packages/
    shared/
      src/
        types/
        constants/
        validators/
  docker-compose.yml
  README.md
```

Có thể dùng monorepo hoặc tách riêng frontend/backend.

Nếu mục tiêu học nhanh và deploy dễ:

- Tách 2 repo cũng được
- Nhưng monorepo nhìn chuyên nghiệp hơn nếu setup tốt

---

## 29. README nên có gì

README GitHub cần thật đẹp vì nhà tuyển dụng thường xem README trước.

Nên có:

- Project title
- Demo URL
- Demo account
- Screenshots
- Feature list
- Tech stack
- Architecture diagram
- Database ERD
- Local setup guide
- Environment variables
- API overview
- WebSocket events overview
- Deployment guide
- What I learned
- Future improvements

---

## 30. Demo data nên chuẩn bị

Để nhà tuyển dụng vào demo thấy app sống động, nên seed sẵn:

- 3 users
- 2 servers
- 5 channels
- 20 messages
- 3 roles
- Một số reactions
- Một số file attachments
- Một invite link demo

Demo account:

```text
Email: demo@example.com
Password: Demo@123456
```

Không dùng password thật.

---

## 31. Thứ tự triển khai khuyến nghị

1. Setup monorepo
2. Setup database schema
3. Auth
4. Server CRUD
5. Channel CRUD
6. Socket connection
7. Realtime message
8. Message history
9. Role/permission
10. Invite join server
11. File upload
12. DM
13. Friend system
14. Presence
15. Voice channel
16. Video call
17. Screen sharing
18. Notification
19. Audit log
20. Docker deploy
21. README + screenshots

---

## 32. Tiêu chí “đủ tốt để đưa vào CV”

Project nên đạt tối thiểu:

- Có demo online chạy được
- Có GitHub public
- README rõ ràng
- Có ảnh screenshot
- Có authentication thật
- Có realtime chat thật
- Có database thật
- Có ít nhất một tính năng nâng cao như role permission hoặc WebRTC
- Code có cấu trúc module rõ ràng
- Có Docker Compose

Nếu chưa có demo online, project sẽ giảm sức thuyết phục rất nhiều.

---

## 33. Những lỗi nên tránh

- Chỉ làm giao diện mà không có backend thật
- Chỉ dùng localStorage thay database
- Không có README
- Không deploy được
- Không có ảnh demo
- Không validate dữ liệu
- Không check permission ở backend
- Không xử lý loading/error state
- Code quá lộn xộn
- Clone UI Discord quá giống nhưng tính năng rỗng

---

## 34. Phiên bản portfolio cuối cùng nên có

Khi hoàn thiện, nên có 3 link:

1. Live Demo
2. GitHub Repository
3. Video demo 2-3 phút

Video demo nên quay:

- Login
- Tạo server
- Tạo channel
- Gửi message realtime bằng 2 tài khoản
- Mention/reaction
- Role permission
- Video call hoặc voice call
- Screen share nếu có

Đây là thứ giúp CV nổi bật hơn rất nhiều.

---

## 35. Kết luận

Dự án Discord Clone này không nên làm theo hướng “clone giao diện”, mà nên làm theo hướng “realtime collaboration platform”.

Tập trung vào:

- Realtime architecture
- Permission system
- WebRTC
- Database design
- Production deployment

Nếu hoàn thành tốt, đây có thể trở thành project chính trong CV Fullstack NodeJS/NestJS.
