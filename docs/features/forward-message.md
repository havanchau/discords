# Feature Spec: Forward Message

Sends a copy of an existing channel or DM message into another channel or DM the caller can write to.

## Goal

A member picks "Forward" on a message and a destination (a channel they can post in, or a DM/group DM they belong to); a new message appears there, tagged as forwarded, without needing to re-attach files by hand.

Acceptance criteria:

- `POST /messages/:messageId/forward` and `POST /direct-messages/:messageId/forward` both accept `{ destinationType: 'channel' | 'conversation', destinationId, comment? }` and re-check read access to the source and write access to the destination on every call — never trust a previously successful render.
- The forwarded message shows a "Forwarded from #channel-name" or "Forwarded from a direct message" label, the original content, and the original attachments, and optionally the forwarder's own comment.
- Forwarding a message the caller can no longer read (e.g. removed from the source channel between opening it and forwarding) returns `403` and creates nothing.
- Forwarding into a destination the caller cannot write to (no `SendMessages`, timed out, slowmode blocked, blocked in DMs) returns the same error the destination's normal send path already returns.
- Deleting the original message afterward does not delete or blank the forwarded copy.

## Scope

- **In scope**: forwarding a channel message to another channel or to a DM/group DM the caller is in; forwarding a DM message to a channel or another DM; carrying attachments by reference; an optional short comment sent as part of the same action; the `DirectMessageAttachment` table plus attaching uploaded files when sending a DM (file picker in the DM composer, `attachments` on `POST /direct-conversations/:id/messages`) and rendering attachments in DM rows, so later features (`voice-messages.md`, `scheduled-messages.md`) reuse one DM attachment path.
- **Out of scope**: forwarding to a server the caller does not belong to, forwarding a whole thread, forwarding to multiple destinations in one action, editing the forwarded copy independently of a normal message edit, re-uploading/duplicating attachment files.

## Current Behavior

- There is no forward concept anywhere in the schema, API, or client; grep for `forward` across `apps/api/src` and `apps/web/src` returns no matches beyond unrelated words.
- Reading a single channel message already re-checks access on every call: `findMessageForUser` loads the message then calls `this.channels.requireReadableChannel(userId, message.channelId)`, which throws `404` if the channel is gone and enforces `ViewChannel` (`messages.service.ts:511-532`, `channels.service.ts:155-162`).
- Posting into a channel enforces, in order, `requireReadableChannel` (view), `requireChannelPermission(..., Permission.SendMessages)`, `requireNotTimedOut`, then slowmode (`messages.service.ts:163-167`).
- Posting into a DM enforces conversation membership (`requireConversationMember`, referenced at `direct-messages.service.ts:70`) and, for 1-1 conversations, the mutual block list via `findBlockBetween` (`direct-messages.service.ts:78-85`); group DMs skip the block check by the comment at `direct-messages.service.ts:78`.
- `MessageAttachment` rows belong to one `Message` (`messageId String`, `apps/api/prisma/schema.prisma:407-416`) with no DM equivalent — `DirectMessage` has no attachment relation at all (`schema.prisma:579-596`), and `CreateDirectMessageDto` has only `content` and `replyToMessageId` (`apps/api/src/modules/direct-messages/dto/create-direct-message.dto.ts`). Today nothing lets a DM message carry a file.
- Channel messages persist to `apps/api/prisma/schema.prisma:353-375`; the attachment `url` already points at durable storage (local disk or Cloudinary, per [media-uploads.md](media-uploads.md)), not at a value scoped to one message, so pointing a second row's `url` at the same file is safe — no re-upload is needed.

## Changes

### Rules

- Forwarding re-runs the exact same read check the source's normal fetch path uses (`requireReadableChannel` for a channel source, `requireConversationMember` for a DM source) and the exact same write checks the destination's normal send path uses — no new permission is introduced.
- `comment` is optional, trimmed, up to 2000 characters, sent as ordinary message `content` on the forwarded copy (not appended into the original's content).
- The forwarded copy is a new message row with its own id, author (the forwarder, not the original author), and `createdAt`; it carries `forwardedFromMessageId`/`forwardedFromDirectMessageId` and a denormalized snapshot (`originalAuthorName`, `originalContent`, `originalChannelName` or a DM marker) so the label survives the source being edited, deleted, or becoming unreadable to the forwarder later (see Trade-offs).
- Attachments are carried by creating new `MessageAttachment`/`DirectMessageAttachment` rows that reuse the source attachment's `url`, `fileName`, `mimeType`, `byteSize` — no new upload call, no new file on disk/Cloudinary.
- Forwarding a message that is already a forward carries the _original_ snapshot forward again (no forward-of-forward chains); the destination shows the same original author and content the first forward showed.
- A deleted source message (`deletedAt` set) cannot be forwarded (`404`), matching how a deleted message already fails `findMessageForUser`-style lookups elsewhere.
- The read check keeps the status its source path already returns: a channel source the caller lost `ViewChannel` on answers `403` (`requireChannelPermission`), while a DM source the caller is not a member of answers `404`, because `requireConversationMembership` deliberately does not confirm conversation ids (`direct-message.format.ts`, `requireConversationMembership`). Nothing is created in either case.
- Forwarding a poll message forwards a **text snapshot of the poll question** only (the question is already the message `content`, `polls.service.ts` `createChannelPoll`). No `Poll` row, options, votes, or voter identities are copied, so a forward can never leak votes and the copy is not a live poll.
- An empty comment and no attachments is allowed for a forward (the snapshot is the content); both send paths accept an empty `content` only when a forward snapshot or attachments are present.
- Cross-context forwarding (channel → DM, DM → channel, DM → DM) is allowed as long as the caller passes both checks; the destination has no knowledge of whether the source was a channel or a DM beyond what the snapshot/label says.
- Forwarding into a channel still runs slowmode and timeout checks exactly like a normal send — a forward is not exempt from either.

### Client

- Message hover/context menu gets a "Forward" action (channel messages: `MessageRow.tsx`; DM messages: the DM message row) opening a destination picker: a searchable list of channels the caller can post in (grouped by server) and DMs/group DMs, reusing the existing channel/conversation list data already loaded into the sidebar rather than a new endpoint.
- The picker has an optional comment field and a Send button; success closes the picker and, if the destination is the currently open channel/DM, the forwarded message appears through the normal realtime event with no special-case rendering path.
- A forwarded message renders like a normal message plus a small "Forwarded from <source>" header above the content, using the same attachment renderer as a normal message (`attachmentKind`, `apps/web/src/helpers.ts:91-96`).
- The attachment renderer is extracted from `MessageRow.tsx` into `components/chat/MessageAttachments.tsx` (pure move, same markup and styles) so channel rows and DM rows share it.
- The DM composer gets the same paperclip file picker as the channel composer (up to 6 files, same `accept` list); files upload through `uploadFile` and are sent as `attachments` on the DM create request. A DM with attachments and no text is allowed.

## Technical Approach

### Data model

```prisma
model Message {
  // ...existing fields
  forwardedFromMessageId       String?
  forwardedFromDirectMessageId String?
  forwardOriginAuthorName      String?
  forwardOriginContent         String?
  forwardOriginLabel           String?  // source channel name; null for a DM source
}

model DirectMessage {
  // ...existing fields
  forwardedFromMessageId       String?
  forwardedFromDirectMessageId String?
  forwardOriginAuthorName      String?
  forwardOriginContent         String?
  forwardOriginLabel           String?
  attachments                  DirectMessageAttachment[]
}

model DirectMessageAttachment {
  id              String        @id @default(cuid())
  directMessageId String
  fileName        String
  mimeType        String
  byteSize        Int
  url             String
  createdAt       DateTime      @default(now())
  directMessage   DirectMessage @relation(fields: [directMessageId], references: [id], onDelete: Cascade)

  @@index([directMessageId])
}
```

`forwardOriginLabel` stores the raw channel name (no `#`, no localized text) or `NULL` for a DM source; the client renders "Forwarded from #name" or "Forwarded from a direct message" in the viewer's locale. Which kind of source it was is derived from whether `forwardedFromMessageId` or `forwardedFromDirectMessageId` is set. The API exposes the snapshot as one object, never the raw columns:

```ts
interface ForwardOrigin {
  sourceType: 'CHANNEL' | 'DIRECT';
  authorName: string;
  content: string;
  channelName: string | null;
}
// Message.forwardOrigin and DirectMessage.forwardOrigin: ForwardOrigin | null
// DirectMessage.attachments: MessageAttachment[]
```

A forward of a forward copies the source's `forwardedFrom*` ids along with its snapshot, so they always name the original message.

`forwardedFrom*` fields are plain nullable ids (no relation/foreign key), so a later hard-delete of the original row never blocks or cascades into the forwarded copy — that is the point of storing a snapshot instead of a live reference.

Migration `20260917002000_add_message_forwarding` (one migration for the whole feature, including `DirectMessageAttachment`). Adding `DirectMessageAttachment` here (rather than in this feature alone) is required because a forwarded DM message with a file needs somewhere to put it — DMs have no attachment table today.

### API

| Method | Path                                  | Body                                                                        | Response          | Rate limit |
| ------ | ------------------------------------- | --------------------------------------------------------------------------- | ----------------- | ---------- |
| `POST` | `/messages/:messageId/forward`        | `{ destinationType: 'channel' \| 'conversation', destinationId, comment? }` | `201 { message }` | 20/min     |
| `POST` | `/direct-messages/:messageId/forward` | same                                                                        | `201 { message }` | 20/min     |

Both endpoints resolve the destination and delegate to the existing `MessagesService.createMessage` / `DirectMessagesService.createMessage` write paths internally (same permission calls, same slowmode/timeout/block enforcement) so the forward never bypasses a check the plain send path has. The snapshot is passed as an extra internal argument to those methods, never read from the request DTO, so a normal send cannot forge a forward label.

`POST /direct-conversations/:conversationId/messages` gains `attachments?: MessageAttachmentInputDto[]` (the same DTO and URL allowlist the channel send uses, at most 10 per message).

### Realtime

- A forward into a channel emits the existing `message:created` to `channelRoom(destinationId)` and the same `unread:updated` per-recipient badge event the socket send emits (`messages.gateway.ts`, `createMessage` / `emitUnreadUpdated`), because `MessagesService.createMessage` itself does not broadcast; a forward into a DM emits the existing `dm:created` to `conversationRoom` plus recipient `userRoom`s (`direct-messages.service.ts:108-115`). No new event type — the client already knows how to render a new message with a `forwardOriginLabel`.

### Files

- API: new `modules/forwarding/` (`forwarding.module.ts`, `forwarding.controller.ts`, `forwarding.service.ts`, `dto/forward-message.dto.ts`) registered in `app.module.ts`; `common/forward-snapshot.ts` (snapshot type, select, `forwardOrigin` formatting, forward-of-forward carry — shared by both message modules); `messages.service.ts` and `direct-messages.service.ts` accept the optional snapshot; `direct-message.format.ts` (attachments include, `forwardOrigin` formatting); `direct-messages.module.ts` exports `DirectMessagesService`; `dto/create-direct-message.dto.ts` (`attachments`).
- Shared: `packages/shared/src/api-contract.ts` (`ForwardOrigin`, `ForwardMessageInput`, `forwardOrigin` on both message types, `DirectMessage.attachments`).
- Web: `api.ts` (type re-exports), `hooks/useForwardMessage.ts`, `components/chat/ForwardMessageDialog.tsx` (+ `.module.css`, destination picker, mounted by the row only while open), `components/chat/ForwardedHeader.tsx` (+ `.module.css`), `components/chat/MessageAttachments.tsx` (+ `.module.css`, extracted), `components/chat/MessageRow.tsx`, `components/home/DirectMessageRow.tsx`, `components/home/DirectMessageComposer.tsx` (+ `.module.css`), `components/home/HomeDirectMessageView.tsx`, `components/home/HomePanel.module.css` (composer grid gains the attach column), `components/home/types.ts`, `hooks/useDirectMessages.ts`, `contexts/WorkspaceContext.tsx` (+ one line in `AppShell.tsx`, exposing the loaded DM conversations to the picker), `i18n/locales/en.ts` and `vi.ts` (`forward.*` keys).

### Deviations from the reviewed draft

- **Separate `forwarding` module** instead of `forwardMessage` inside `messages.service.ts` / `direct-messages.service.ts`: `messages.service.ts` is already 713 lines and one module owning both directions keeps the cross-context read/write checks in one place. It still delegates every write to the two existing send methods.
- **Migration name** `20260917002000_add_message_forwarding` instead of `20260917020000_…`, to sit directly after `20260917001000_add_saved_messages`.
- **DM uploads in scope**: the draft kept a DM composer attachment feature out of scope; it is built here so `DirectMessageAttachment` has one tested write path before voice and scheduled messages reuse it.
- **`forwardOriginLabel` holds the channel name, not display text**, so the label is localized at render time (`i18n-localization.md`).
- **Poll forwarding and DM `404`** are spelled out in Rules above; the draft did not cover them.
- **No Forward action on end-to-end encrypted channel messages** (`message.isEncrypted` on the client): the server only holds their ciphertext, so a forward would copy unreadable text. The endpoint itself does not know about encryption and still accepts such a forward (see Risks).
- **DM rows have no context menu today**, so the DM Forward action is the hover button only; channel rows get both the hover button and a context-menu item.
- **Channel forwards also emit `unread:updated`**, matching the socket send; `ForwardingModule` provides its own `RealtimeUnreadService` instance (stateless) rather than importing the gateway module.

## Trade-offs

- **Denormalized snapshot vs. a live foreign key to the source message**: a live FK (`onDelete: Cascade` or `SetNull`) would either delete forwards when the source is deleted (surprising — the forward is supposed to survive) or silently blank the label. A snapshot costs a few duplicated columns but keeps the forwarded copy fully independent, matching how the acceptance criteria explicitly requires the copy to survive the original's deletion.
- **Reusing the source attachment's `url` vs. copying the file**: the storage layer already serves the same URL to any authorized reader indefinitely (per [media-uploads.md](media-uploads.md)); copying bytes would double storage cost for no correctness gain, since access to the _forwarded_ message is what is checked, not access to the file URL itself.
- **Adding `DirectMessageAttachment` now vs. deferring DM attachments entirely**: forwarding a channel message with a file into a DM is a normal, expected case (acceptance criteria requires channel↔DM forwarding), so DMs need at least this minimal attachment table. The DM composer upload is built in the same change (see Deviations) so the table has a direct write path from day one; voice and scheduled messages reuse it.
- **Delegating to the existing send paths vs. a bespoke forward-only write**: reusing `createMessage`/`createDirectMessage` guarantees slowmode, timeout, and block checks can never drift between "send" and "forward"; the cost is an extra internal call rather than a hand-rolled insert.

## Risks & Rollback

- **Risk**: a caller who briefly held read access to a channel (later removed) but already opened the forward dialog is still re-checked at submit time per the acceptance criteria, so the risk is limited to a confusing UI state (dialog open, submit fails) rather than a data leak.
- **Risk**: `forwardOriginContent` snapshots the content at forward time; if the original is edited afterward, the forwarded copy keeps the pre-edit text — this is intentional (a forward is a copy, not a live reference) but should be called out to the user reviewing this doc.
- **Risk**: a message from an end-to-end encrypted channel is stored by the server as ciphertext, so its snapshot is ciphertext and renders as such in the destination; the forward comment is sent as plain text even into an encrypted channel. Same limitation as `saved-messages.md`; client-side re-encryption of forwards is not implemented.
- **Risk**: attachment URLs are shared between the source and the forwarded copy; deleting a message never deletes files today, so no cleanup path can remove a file still referenced by a forward. A future file-cleanup job must count references across `MessageAttachment` and `DirectMessageAttachment`.
- **Rollback**: revert code; the migration is additive (new nullable columns, new `DirectMessageAttachment` table). Reverting it drops DM attachments created meanwhile.

## Test Plan

No automated test suite in this repo (`RULE.md:77`); verified with `npm run typecheck`, `npm run lint`, `npm run build`, plus the manual scenario below.

- **Manual — channel to DM**: member A forwards a message with an image attachment from `#general` into a DM with B, adding a comment → B sees the forwarded header, the original text, the image, and A's comment.
- **Manual — survives deletion**: A forwards a message, then the original author deletes the source message → the forwarded copy in the destination is unchanged.
- **Failure case**: member C, removed from the source channel after opening the forward dialog, submits the forward → `403`, nothing created in the destination.
- **Manual — DM upload**: in a DM, attach an image and a PDF with no text and send → both recipients see the image preview and the file card; reload keeps them.
- **Manual — poll**: forward a poll message into a DM → the copy shows "Forwarded from #channel" with the question as text and no vote buttons; voting on the source does not change the copy.
- **Manual — blocked / slowmode**: forward into a 1-1 DM with a user who blocked the caller → `You cannot message this user`; forward twice into a channel with slowmode → the second returns the slowmode `429`.
- **Failure case — DM source**: a user removed from a group DM forwards one of its messages → `404`, nothing created.

## Deployment Notes

- Run migration `20260917002000_add_message_forwarding` before deploying the API.
- New `forward.*` i18n keys ship in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
