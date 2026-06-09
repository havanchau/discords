# Discord Clone Feature Specification

This document defines the product scope. It avoids implementation sequencing; delivery order lives in `implementation-plan.md`.

## Product Goal

Build a Discord-inspired realtime communication app that demonstrates full-stack product engineering:

- Authentication and authorization.
- Server, channel, member, role, and permission modeling.
- Realtime text chat.
- Direct messages and friend workflows.
- Media-friendly messaging.
- Voice, video, and screen-share foundations.
- Production deployment and security hardening.

## User Roles

| Role               | Capabilities                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| Guest              | Register, log in, preview public invite metadata when supported.                     |
| User               | Join servers, send messages, manage own profile, use DMs and calls where authorized. |
| Server Owner       | Full control over one server, including roles, channels, invites, and members.       |
| Admin or Moderator | Manage configured parts of a server based on assigned permissions.                   |

## Core Domain Model

| Entity                 | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| User                   | Account identity and profile.                           |
| Server                 | Top-level community workspace.                          |
| Member                 | User membership inside a server.                        |
| Role                   | Permission bundle assigned to members.                  |
| Channel                | Server-scoped text or voice surface.                    |
| Message                | User content inside a channel or conversation.          |
| Conversation           | One-to-one or group direct message thread.              |
| Invite                 | Join token for server membership.                       |
| Attachment             | File or media metadata associated with a message.       |
| Reaction               | Emoji response to a message.                            |
| ReadState              | Per-user read cursor and unread count source.           |
| NotificationPreference | Server or channel notification configuration.           |
| AuditLog               | Server-side record of important administrative actions. |

## Feature Areas

### Authentication

- Register with email, username, and password.
- Log in with credentials.
- Refresh access tokens.
- Log out and revoke refresh tokens.
- Fetch the current user.
- Update profile fields and avatar.
- Support email verification when SMTP is configured.

### Servers and Channels

- Create, update, and delete servers.
- Automatically create owner membership, `@everyone` role, and default text channel.
- List servers for the current user.
- Create, update, delete, and reorder channels.
- Support text and voice channel types.
- Support private channel access through role overrides.
- Join servers through invites.

### Roles and Permissions

- Create, update, delete, and assign roles.
- Evaluate permissions server-side for all protected operations.
- Support server-level permissions and channel overrides.
- Prevent privilege escalation, owner removal by non-owners, and unauthorized moderation.

### Messaging

- Send text messages in authorized channels.
- Load history with cursor pagination.
- Edit and soft-delete messages.
- Reply to messages.
- React to messages.
- Pin and unpin messages.
- Show typing indicators.
- Track unread counts and mention badges.
- Support optional passphrase-based channel E2EE for message bodies.

### Direct Messages and Friends

- Send, accept, decline, and cancel friend requests.
- Block and unblock users.
- Create one-to-one direct conversations.
- Send realtime DM messages.
- Track unread direct messages.

### Media and Uploads

- Upload files, images, videos, and voice messages.
- Validate file type and size server-side.
- Store files locally in development and in Cloudinary for hosted environments.
- Support chunked uploads for large files.
- Render image, video, file, and audio previews in chat.

### Voice, Video, and Screen Share

- Join and leave voice channels.
- Signal WebRTC sessions through the realtime gateway.
- Track participants, mute, deafen, and active call state.
- Support receive-only stream join for screen share.
- Provide a foundation for direct video calls.

### Notifications and Presence

- Show online, idle, do-not-disturb, invisible, and offline states.
- Broadcast presence only to authorized viewers.
- Track channel unread state across refreshes.
- Support notification preferences such as muted server, muted channel, and mentions-only.

### Moderation and Audit

- Delete other users' messages when permitted.
- Kick members when permitted.
- Record server, channel, role, invite, pin, and moderation-adjacent actions in audit logs.
- Keep audit records separate from user-editable content.

## API Surface

The API should remain resource-oriented and guarded by auth and permission checks.

| Area     | Representative Routes                                                        |
| -------- | ---------------------------------------------------------------------------- |
| Auth     | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me` |
| Users    | `/users/me`, `/users/:userId`                                                |
| Servers  | `/servers`, `/servers/:serverId`                                             |
| Channels | `/servers/:serverId/channels`, `/channels/:channelId`                        |
| Messages | `/channels/:channelId/messages`, `/messages/:messageId`                      |
| DMs      | `/conversations`, `/conversations/:conversationId/messages`                  |
| Friends  | `/friends`, `/friends/requests`, `/friends/blocks`                           |
| Roles    | `/servers/:serverId/roles`, `/roles/:roleId`                                 |
| Invites  | `/servers/:serverId/invites`, `/invites/:code`                               |
| Uploads  | `/uploads`, chunked upload endpoints                                         |

## Realtime Events

Event names should be explicit and payloads should be typed in `packages/shared`.

| Area          | Events                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Connection    | `connection`, `disconnect`, auth failure                                                                      |
| Rooms         | `channel:join`, `channel:leave`, `conversation:join`, `conversation:leave`                                    |
| Messages      | `message:create`, `message:created`, `message:update`, `message:updated`, `message:delete`, `message:deleted` |
| Typing        | `typing:start`, `typing:stop`                                                                                 |
| Reactions     | `reaction:add`, `reaction:remove`                                                                             |
| Presence      | `presence:update`                                                                                             |
| Voice         | `voice:join`, `voice:leave`, `voice:state`                                                                    |
| WebRTC        | `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`                                                       |
| Notifications | `notification:create`, `read-state:update`                                                                    |

## UI Surfaces

Detailed UI rules live in `design-rules.md`.

- Auth screens.
- Server rail.
- Channel sidebar.
- Chat header.
- Message timeline.
- Composer.
- Member sidebar.
- Settings modals.
- Friends and DM surfaces.
- Voice and screen-share controls.
- Attachment previews.
- Empty, loading, error, and unauthorized states.

## MVP Scope

MVP 1:

- Auth.
- Server creation.
- Invite join.
- Channel list.
- Realtime text chat.
- Message history.

MVP 2:

- Roles and permissions.
- Message edit and delete.
- File uploads.
- Reactions and replies.

MVP 3:

- Friends.
- Direct messages.
- Presence.
- Persistent unread state.

MVP 4:

- Voice channel foundation.
- Screen-share foundation.
- Production deployment polish.

## Portfolio Criteria

The project is portfolio-ready when:

- A reviewer can run it locally from the README.
- A hosted demo is available or deployment steps are proven.
- Two users can demonstrate realtime messaging.
- Permission checks are visible in both API behavior and UI affordances.
- Media upload works with safe validation.
- Architecture, deployment, security, and UI docs are accurate and in English.
- CI or documented local checks cover lint, typecheck, build, and key tests.

## Feature Completion Checklist

- [x] Auth foundation.
- [x] Server and channel foundation.
- [x] Realtime channel chat.
- [x] File, image, video, and voice-message uploads.
- [x] Reactions, replies, edits, soft deletes, and pins.
- [x] Role-based permissions and channel role overrides.
- [x] Persistent read state for channels.
- [x] Voice and screen-share foundation.
- [x] Audit log foundation.
- [ ] Realtime direct messages.
- [ ] Full friend-system polish.
- [ ] Message search.
- [ ] Member-level channel overrides.
- [ ] Notification inbox.
- [ ] Full moderation suite.
- [ ] Production CI smoke tests against deployed URLs.
