# Product Rules

These are repository-level product and engineering invariants. They should remain stable even when implementation details change.

## Domain Rules

Core entities:

- User: account identity.
- Server: top-level community workspace.
- Channel: scoped conversation inside a server.
- Member: a user's membership inside a server.
- Role: permission bundle assigned to members.
- Message: user-created content inside a channel or direct conversation.
- Conversation: direct or group direct message thread.

## Permission Rules

Every protected operation must be checked server-side.

Required baseline permissions:

- `server.manage`: edit server settings and delete the server.
- `channel.manage`: create, edit, delete, and reorder channels.
- `role.manage`: create roles and assign permissions.
- `member.manage`: kick, ban, timeout, and change nicknames.
- `message.send`: send messages.
- `message.manage`: delete or moderate other users' messages.
- `invite.create`: create server invites.

Owners always have all permissions in their server. Admin roles bypass channel-level restrictions unless product requirements explicitly disable that behavior.

## Messaging Rules

- Messages require an authenticated user.
- Messages require membership in the target server or conversation.
- Message content must be trimmed and validated before persistence.
- Empty messages are allowed only when attachments exist.
- Edited messages must retain `createdAt` and update edit metadata.
- Deleted messages should not break thread history or unread state.
- Server-generated IDs are the source of truth.

## Channel Rules

- A server must have at least one text channel.
- Channel names should be lowercase, URL-safe, and unique inside a server when practical.
- Private channels must validate membership or role access before reads and writes.
- Reordering channels must be transactional.

## Realtime Rules

- Persist first, emit second.
- Do not trust client-sent user IDs, role IDs, or permission claims.
- Broadcast only to authorized subscribers.
- Include enough payload data for clients to update cache without a full refetch.
- Handle reconnects by refetching missed state from the API.

## Auth Rules

- Never expose password hashes, provider tokens, refresh tokens, or session secrets to the client.
- Store session secrets only in environment variables or a secret manager.
- All unauthenticated API responses must be explicit and consistent.

## File Upload Rules

- Validate file type and size server-side.
- Store files outside the app repository.
- Persist metadata needed for authorization and cleanup.
- Do not allow arbitrary user-controlled paths.

## Code Quality Rules

- Prefer typed interfaces for API requests, responses, events, and database models.
- Keep business rules in shared services or server modules, not only in UI handlers.
- Keep UI components presentational when possible.
- Avoid hidden global state for auth, sockets, and permissions.
- Add regression tests for fixed bugs.
