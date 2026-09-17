# Feature Spec: Wave 3.2 Follow-Ups

Fixes for the "Follow-Ups Found During Implementation" list in [feature-roadmap.md](../feature-roadmap.md). Each fix is small; they share one doc because they were found together and ship together.

The three decisions below were taken by the product owner on 2026-09-17, before implementation:

- Polls, scheduled messages and forwarding in E2EE channels are blocked **in the client**, because the API cannot tell which channels are encrypted.
- AutoMod **refuses `e2ee:v1:` content** while an enabled rule applies to the author in that channel.
- Cancelling an account deletion requires the **second factor** when 2FA is on, plus a **per-account limit**.

This doc was written after the code, at the owner's request to fix the list directly; it describes what was built.

## Goal

Close the follow-ups that are bugs, security gaps or missing entry points, without new tables or env vars.

Acceptance criteria:

- Joining by invite works from the web client.
- A `MANAGE_ROLES` holder cannot create, edit, delete, add or remove a role with permissions they do not hold.
- Socket sends run the same validation as REST sends.
- An account with 2FA cannot be un-deleted with the password alone; cancel attempts are limited per email address.
- Encrypted messages cannot bypass AutoMod.
- Polls and forwards do not put plaintext into a channel this client encrypts.
- A REST channel poll bumps unread badges live; a DM poll notifies like a DM.
- "Jump to message" from Saved Messages scrolls to the message.
- Turning rules screening on or off updates open tabs without a reload.
- Thread and forum messages can be reacted to, saved, reported and deleted from the thread panel.
- Account export includes saved server templates and filed server reports.
- Notifications and AutoMod alerts name a bot by its display name.
- Deleting a sticker or soundboard clip deletes its stored file.
- `i18n:check`, `check:file-size` and `ui:scan` cover every source file.

## Scope

- **In scope**: the items above.
- **Out of scope**:
  - A review surface for discovery `ServerReport`s. It needs a platform-level reviewer, which does not exist; see open question 16.
  - `.env.example` entries for `VOICE_MAX_BYTES` and `PRIVATE_STORAGE_LOCAL_DIR`. Agents cannot edit `.env*` files.
  - Deleting avatar and banner files on account deletion; see Changes.
  - Checking a reported `byteSize` against the stored file; see Risks.

## Current Behavior

- **Invite join**: the web posts to `/servers/invites/:code/join` and reads `{ server }` (`apps/web/src/hooks/useWorkspaceNavigation.ts:72`). The route is `POST /invites/:code/join` (`apps/api/src/modules/servers/servers.controller.ts:163`) and returns `{ serverId, channelId, member, joinedNow }`, so every join failed.
- **Roles**:
  - `createRole`, `updateRole`, `deleteRole`, `addMemberRole` and `removeMemberRole` only require `MANAGE_ROLES` (`apps/api/src/modules/roles/roles.service.ts:25`, `:80`).
  - A holder could therefore give themselves any permission.
  - Only bot authorize checked what the granter holds (`installerCanGrant`, `apps/api/src/modules/bots/bot-grant.ts`).
- **Socket sends**: `message:create` and `thread:message:create` pass the body to the service without the DTO pipe (`apps/api/src/modules/realtime/messages.gateway.ts:62`), so the attachment URL allowlist, MIME list and size cap were not applied.
- **Account deletion cancel**:
  - It verifies the password with `requireSecondFactor: false` (`apps/api/src/modules/users/account-deletion.service.ts:92`).
  - It is limited per IP only (`apps/api/src/modules/users/account-deletion-cancel.controller.ts:11`).
- **AutoMod**: it drops `e2ee:v1:` texts before evaluating (`apps/api/src/modules/automod/automod-screening.service.ts:82`), so ciphertext skipped every rule.
- **E2EE**:
  - `/poll` posts in any channel (`apps/web/src/utils/executeSlashCommand.ts:53`).
  - Forward was hidden only for encrypted messages (`apps/web/src/components/chat/MessageRow.tsx:200`), not for plaintext messages in an encrypted channel, nor as a destination.
- **Polls**:
  - A channel poll emits only `message:created` (`apps/api/src/modules/polls/polls.service.ts:84`).
  - A DM poll emits only `dm:created` (`:131`), with no unread update, author read state or notification.
- **Saved Messages**: "Jump" opens the channel or conversation only (`apps/web/src/components/saved/SavedMessagesPanel.tsx:57`).
- **Rules screening**: `updateOnboarding` emits nothing (`apps/api/src/modules/servers/server-onboarding.service.ts:33`).
- **Thread panel**: messages render text and stickers with no actions (`apps/web/src/components/chat/ThreadPanel.tsx:91`).
- **Account export**: it ends at soundboard clips (`apps/api/src/modules/users/account-export-collector.ts:334`).
- **Bot names**: mention push and AutoMod alerts use `author.username` (`apps/api/src/modules/messages/messages.service.ts:254`, `apps/api/src/modules/automod/automod-screening.service.ts:146`), which is `bot-<hex>` for a bot.
- **Stored files**: sticker and clip deletion removes only the row (`apps/api/src/modules/stickers/stickers.service.ts:114`).
- **Scripts**:
  - `i18n-scan.mjs` lists `apps/web/src/**/*.ts` (`scripts/i18n-scan.mjs:25`), which skips files directly under `src`.
  - `check-file-size.mjs:26` and `ui-static-scan.mjs` list tracked files only.

## Changes

### Invite join

The web posts to `/invites/:code/join` and reads the result as `DiscoveryJoinResult` (the same fields). It then refreshes the server list, opens `serverId`, selects `channelId` when set, and shows `server.notice.joined`.

### Role grants

`installerCanGrant` moved to `apps/api/src/modules/permissions/role-grant.ts` as `canGrantRoles`, with `loadRoleGrantContext`. Bot authorize and roles now share it.

A non-owner `MANAGE_ROLES` holder must be able to grant every role involved:

| Action                     | Roles checked                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------ |
| create role                | the new permission set (server level; a new role has no overrides)                   |
| update role                | the role as it is **and** as it would become, so a role above the caller stays fixed |
| delete role                | the role                                                                             |
| add / remove a member role | the role                                                                             |

"Can grant" means every server-level permission is held by the caller, and every channel override allowing something to the role allows only what the caller has in that channel. Refusal: `403 Cannot manage a role with permissions you do not have`. The owner is exempt.

### Socket send validation

- `realtime/socket-validation.ts` runs `CreateMessageDto` through a `ValidationPipe` with the same options as `main.ts` (`whitelist`, `transform`, `forbidNonWhitelisted`), for both `message:create` and `thread:message:create`.
- A failure is a `BadRequestException` carrying the first constraint message. `message:create` acknowledges it as `{ error }`, translated.

### Account deletion cancel

- `verifyReauthentication` now runs with `requireSecondFactor: true`. The body may carry `code`, an authenticator or recovery code. A missing or wrong code on a 2FA account is the same `400 Invalid password or code`.
- A Redis limit of 5 per 15 minutes is keyed by the lower-cased email (`ACCOUNT_DELETION_CANCEL_LIMIT`), on top of the per-IP route limit.
  - An unknown address is counted the same way, so the limit does not reveal which addresses exist.
  - Refusal: `429` with `Retry-After`, the same shape as other per-account limits (`users/reject-when-limited.ts`, moved out of `account.controller.ts`).
- The cancel form gains an optional "Authenticator code" field, sent only when filled.

### AutoMod and E2EE

`screen()` first drops channel-exempt rules, then role-exempt rules. If any text is `e2ee:v1:` ciphertext and a rule is still left, the send or edit is refused with `400 Encrypted messages are blocked while AutoMod is enabled`.

Encrypted messages keep working in these cases:

- a server with no enabled rules
- an exempt channel
- an author whose roles exempt them from every rule

### E2EE in the client

`WorkspaceContext.isChannelEncrypted(channelId)` reports whether this client holds a key for the channel. The API has no such flag.

- `/poll` in such a channel shows `poll.error.encryptedChannel` and posts nothing.
- "Forward" is hidden for every message in such a channel.
- Such channels are not offered as forward destinations.
- Scheduling was already hidden there (`MessageComposer.tsx`).
- Another client that has not set the passphrase still sees and can use these features. That is inherent to client-held keys.

### Poll delivery

- **Channel poll**: after `message:created`, it emits `unread:updated` to each unread recipient, exactly as a socket send and a forum post do (`RealtimeUnreadService.listUnreadRecipients`).
- **DM poll**: it calls the new `DirectMessagesService.announceCreatedMessage`, extracted from `createMessage`. That covers the author read state, `dm:created`, `dm:unread`, and a `DIRECT_MESSAGE` notification whose body is the question.

### Saved Messages jump

- `utils/pendingMessageJump.ts` holds one pending jump `{ messageId, channelId | conversationId }` that expires after 10 s.
- Saved Messages sets it before opening the destination.
  - `ChatPanel` runs it through `MessageList.scrollToMessage` once that channel's messages have loaded and include the message.
  - `HomeDirectMessageView` does the same with `jumpToDirectMessage`.
- A message older than the loaded history is not found. The jump then expires and the view stays at the latest messages.

### Rules screening event

`updateOnboarding` emits `server:onboarding-updated` `{ serverId }` to `server:<id>` after the write. `useServerModeration` invalidates that server's detail and onboarding queries, so `needsOnboarding` and the rules gate update live.

### Thread and forum message actions

Every non-deleted message in the thread panel shows its reactions and a row of actions. A forum post's root and replies are covered too.

| Action | Who sees it                               | Behaviour                                                             |
| ------ | ----------------------------------------- | --------------------------------------------------------------------- |
| React  | everyone                                  | `reaction:toggle` over the socket, REST fallback                      |
| Save   | everyone                                  | the existing `SaveMessageAction`                                      |
| Report | anyone but the author                     | the existing `ReportMessageDialog`                                    |
| Delete | the author, or a `MANAGE_MESSAGES` holder | two clicks to confirm, then `DELETE /messages/:id`; the API re-checks |

The panel applies `reaction:updated` for its root and replies.

### Account export

- `serverTemplates`: name, source server id, roles, categories, channels, overrides, onboarding, `createdAt`.
- `serverReportsFiled`: server id and name, reason, details, `createdAt`.
- Reports filed about servers the user owns are not included, the same rule as message reports.

### Bot names

`notificationAuthorName(author)` in `messages/message.format.ts` returns `displayName` for `kind: 'BOT'` and `username` otherwise. It is used for mention push (channel sends, edits, forum posts) and AutoMod alerts.

### Stored files

- `UploadsService.removeStoredFile(url, mimeType)` deletes a file the API stored itself. It works only when the last path segment is a generated `<uuid>.<ext>` name.
  - Local driver: the file under `STORAGE_LOCAL_DIR`.
  - Cloudinary: the public id rebuilt from `CLOUDINARY_FOLDER` and the resource type.
- Sticker and clip deletion call its quiet variant after the row is gone. A storage failure is logged without the URL and does not fail the request.
- Avatars and banners are **not** deleted on account deletion. `avatarUrl` is a URL the client chose (`UpdateMeDto`) and can point at any upload, including another user's attachment, so deleting it could break other rows. The follow-up stays open with this reason.

### Scripts

- `i18n-scan.mjs` lists `apps/web/src/*.ts(x)`. Without `:(glob)` magic, a pathspec `*` matches `/`, so this includes files directly under `src`.
- `i18n-scan.mjs` also skips files deleted in the working tree, which crashed it.
- `check-file-size.mjs` and `ui-static-scan.mjs` list `--cached --others --exclude-standard`, so new files are checked before they are staged.

### New API error literals

Each has `en` and `vi` entries:

- `Cannot manage a role with permissions you do not have`
- `Encrypted messages are blocked while AutoMod is enabled`
- `Invalid message`

## Technical Approach

- **API**:
  - `permissions/role-grant.ts` (moved from `bots/bot-grant.ts`), `roles/roles.service.ts`, `bots/bot-authorization.service.ts`
  - `realtime/socket-validation.ts`, `realtime/messages.gateway.ts`
  - `users/account-deletion.service.ts`, `users/account-deletion-cancel.controller.ts`, `users/account-deletion.rules.ts`, `users/reject-when-limited.ts`, `users/account.controller.ts`
  - `automod/automod-screening.service.ts`
  - `polls/polls.service.ts`, `polls/polls.module.ts`, `direct-messages/direct-messages.service.ts`
  - `servers/server-onboarding.service.ts`
  - `users/account-export-collector.ts`
  - `messages/message.format.ts`, `messages/messages.service.ts`, `forum/forum-posts.service.ts`
  - `uploads/uploads.service.ts`, `stickers/stickers.service.ts`, `soundboard/soundboard.service.ts`
  - `common/i18n/*`
- **Shared**: `RealtimeEvents.ServerOnboardingUpdated`.
- **Web**:
  - `hooks/useWorkspaceNavigation.ts`, `components/auth/CancelDeletionForm.tsx`, `hooks/useAuthSession.ts`
  - `contexts/WorkspaceContext.tsx`, `AppShell.tsx`, `utils/executeSlashCommand.ts`, `components/chat/ForwardMessageDialog.tsx`, `components/chat/MessageRow.tsx`
  - `utils/pendingMessageJump.ts`, `components/saved/SavedMessagesPanel.tsx`, `components/ChatPanel.tsx`, `components/home/HomeDirectMessageView.tsx`
  - `hooks/useServerModeration.ts`
  - `hooks/useThreadPanel.ts`, `components/chat/ThreadPanel.tsx`, `components/chat/ThreadMessageActions.tsx`
  - locale catalogs
- **Scripts**: `i18n-scan.mjs`, `check-file-size.mjs`, `ui-static-scan.mjs`.
- No migration, no new env var, no new dependency.

## Trade-offs

- **E2EE blocking in the client vs. a `Channel.isEncrypted` flag**: a flag would let the API enforce the block, but it needs a migration and a shared notion of "this channel is encrypted", which today is only a passphrase each client chooses. The owner chose the client block. A modified or unconfigured client can still post a poll there.
- **AutoMod refusing ciphertext vs. a per-server setting**: a setting needs a migration and UI. Tying the refusal to "a rule applies here" keeps encryption usable wherever moderation is off or exempted, which is the owner's choice.
- **Role checks on every role action vs. only on assignment**: checking only assignment would still let a holder edit their own role upward. Checking the role before and after the edit also stops a holder from weakening a role above them. Discord solves this with role position. The permission-subset rule reuses the bot rule instead of introducing a hierarchy.
- **One pending jump in a module store vs. a URL parameter**: the app has no message-level routes, and a store needs no router change. The cost is that a jump to unloaded history silently expires.
- **Per-email cancel limit vs. per-user-id**: keying by user id would skip unknown addresses and reveal which ones exist.
- **Not deleting avatar and banner files**: safe but leaves orphans. Deleting safely needs ownership tracking for uploads, which does not exist.

## Risks & Rollback

- **Role checks**: a server whose non-owner admins relied on granting permissions they do not hold now gets `403`. The owner can still do it.
- **Socket validation**: `forbidNonWhitelisted` now rejects unknown fields on socket sends. The web client sends only DTO fields (`api.ts` `uploadMessageAttachments`). Other socket clients sending extra fields will be refused.
- **`byteSize`** is still client-reported on both REST and socket. Only its range is validated.
- **AutoMod**: servers with enabled rules and members using E2EE will see encrypted sends refused. Exempting a role or channel restores them.
- **Rollback**: revert the code. Nothing is stored in a new shape.

## Test Plan

Not covered by automated tests (`RULE.md`). Verified with `typecheck`, `lint`, `build`, `i18n:check`, `ui:scan`, `check:file-size`, `docs:check` and Prettier. The manual scenarios below have not been run.

- **Invite**: create an invite, open the join dialog as another user, enter the code. The server opens on the invite's channel. An expired code shows `Invite expired`.
- **Roles**: as a member whose role has only `MANAGE_ROLES`:
  - create a role with `BAN_MEMBERS` → `403`
  - add the owner-made admin role to yourself → `403`
  - edit a role you do hold → allowed
- **Socket validation**: emit `message:create` with an attachment URL `https://example.com/x.png` → ack `{ error: 'Attachment URL must reference an uploaded file' }`.
- **Cancel deletion**:
  - on a 2FA account, request deletion, then cancel with the password only → `400`; with the password and a code → `200`
  - send 6 attempts in 15 minutes for one email → `429`
- **AutoMod**: enable a keyword rule, set a channel passphrase, send → refused. Exempt that channel → the encrypted send goes through.
- **E2EE**: with a passphrase set, `/poll Q | A | B` shows the encrypted-channel error; Forward is hidden; the channel is absent from another message's forward list.
- **Polls**: a second tab in another channel sees the unread badge when a poll is posted. A DM poll bumps the DM badge and creates a notification.
- **Jump**: save a message, open another channel, then use Saved Messages → Jump. The view scrolls to and highlights the message. Same flow for a DM.
- **Screening**: tab B (a member who has not accepted) is open; the owner enables screening in tab A. Tab B shows the rules gate without a reload.
- **Thread**:
  - open a forum post, react to the root and a reply; a second client sees the reactions
  - save and report a reply
  - delete your own reply with two clicks
  - a non-author without `MANAGE_MESSAGES` has no delete button
- **Export**: save a template and report a server, then request an export. Both lists are present.
- **Bot name**: a bot message mentioning a user sends a push titled with the bot's name.
- **Files**: delete a sticker; its file is gone from `STORAGE_LOCAL_DIR`.
- **Scripts**: a new untracked `.tsx` with a hardcoded label fails `i18n:check`.

## Deployment Notes

- No migration and no env var.
- The API and web client must ship together:
  - the invite join fix is client-side
  - the cancel form's code field matches the API's new requirement
  - the thread actions use existing endpoints
