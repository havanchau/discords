# Feature Spec: Server Stickers and Soundboard

Server-scoped static image stickers sent as message attachments, and short audio clips a member can trigger to play for everyone currently in a voice call.

**Depends on**: [`custom-emoji.md`](./custom-emoji.md) — stickers reuse its upload/limit/permission/audit pattern (`ServerEmoji`, `MANAGE_SERVER`-gated CRUD, `server:emojis-updated`-style realtime refresh) rather than inventing a second one. **Soundboard playback that actually mixes into the call's media stream depends on** [`voice-sfu.md`](./voice-sfu.md), which is an unimplemented design (see Current Behavior) — this doc's soundboard section designs the phase that works against today's mesh transport and calls out explicitly what changes once an SFU exists.

## Goal

Members with `MANAGE_SERVER` upload a set of server stickers and soundboard clips; any member can send a sticker in a channel message and trigger a soundboard clip while in a voice call, both scoped per server and limited in count.

Acceptance criteria:

- Stickers: `POST` creates a named sticker from an uploaded static image; `:sticker:name:` (or a picker) inserts it as a message attachment that renders as an image, distinct from a regular file attachment or a `:name:` emoji.
- A server holds at most 30 stickers and 30 soundboard clips (separate caps).
- Soundboard: a member connected to a voice call in that server can trigger a clip; every other participant currently in that same call room hears/sees it play, without needing to be a `MANAGE_SERVER` member.
- Create/delete for both stickers and clips require `MANAGE_SERVER` and are audited.
- Upload validation (type, size) happens server-side, reusing the existing upload allowlist.
- Adding or deleting a sticker or clip updates open clients live.

## Scope

- **In scope**: `ServerSticker` and `SoundboardClip` models, CRUD endpoints for both, sticker picker + message rendering, soundboard panel in the voice call UI, socket-broadcast playback trigger, per-server limits, permission gating, audit log.
- **Out of scope**: animated stickers (APNG/Lottie/GIF) — static PNG/WEBP only in this phase, matching `custom-emoji.md`'s own out-of-scope note on animated emoji controls; stickers in DMs; a public/default sticker pack shared across servers; actually mixing soundboard audio into the SFU media plane server-side (depends on `voice-sfu.md` shipping first — see Changes); per-clip volume/cooldown configuration; sticker packs/categories.

## Current Behavior

- `ServerEmoji` (`apps/api/prisma/schema.prisma:192-204`) is the only server-scoped media-asset model today: `id, serverId, name, url, creatorId, createdAt`, unique on `(serverId, name)`, with create/delete gated by `MANAGE_SERVER` and a 50-per-server cap (`docs/features/custom-emoji.md:11,34,63`). No `ServerSticker` or soundboard concept exists in the schema (grepped: no matches for `Sticker` or `Soundboard`).
- Uploads are validated server-side by MIME type and extension against a fixed allowlist that already includes `image/png`, `image/webp`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/mp4` (`apps/api/src/modules/uploads/uploads.service.ts:11-26`), so both a sticker image and a soundboard audio clip already pass through an existing, unmodified validation path — no new MIME types need to be allowlisted for this doc's static-image/short-clip scope.
- `MessageAttachment` (`apps/api/prisma/schema.prisma:407-416`) is `id, messageId, fileName, mimeType, byteSize, url` — a generic file attachment with no "kind" discriminator, so today every attachment renders the same way regardless of whether it is a photo the user uploaded or (hypothetically) a sticker.
- Voice call membership is tracked by `CallRegistryService` in Redis, keyed by `callRoom(channelId) = \`call:${channelId}\`` (`apps/api/src/modules/realtime/call-registry.service.ts:46-47`); `voice.gateway.ts`'s `voice:join`handler joins the caller's socket to that room and authorizes via`access.authorizeCallJoin` before anything else (`voice-sfu.md:16,45`, describing the same current gateway this doc also targets).
- **Voice transport today is full mesh WebRTC, not an SFU**: `voice-sfu.md:39-64` documents this as the current, deliberate baseline — each client opens a direct `RTCPeerConnection` per remote participant (`useChannelCall.ts:32`, cited in `voice-sfu.md:57`); the API "never touches the actual audio/video bytes today" (`voice-sfu.md:49`). This matters directly for soundboard: the API has no place to inject a mixed audio stream into an ongoing mesh call, because it is not in the media path at all.

## Changes

### Stickers — Rules

- Create: `MANAGE_SERVER`; `name` matches the same `^[a-zA-Z0-9_]{2,32}$` pattern and per-server uniqueness `custom-emoji.md:11,34` already uses for emoji, kept identical for consistency between the two similar features; `400 Sticker limit reached` at 30 per server; the image must be an uploaded PNG or WEBP URL (no GIF/APNG in this phase — animated stickers are out of scope, unlike emoji which does allow GIF, because Discord-style stickers are conventionally larger and animation cost is deferred deliberately).
- Delete: `MANAGE_SERVER`; `404` if the sticker does not belong to that server; messages that already used the sticker keep their attachment row (the image URL persists; the sticker no longer appears in the picker for new use), the same "old references degrade gracefully, no cascade rewrite" choice `custom-emoji.md:35,91` makes for emoji.
- List: any member.
- Sending a sticker: reuses the existing message-creation path (`MessagesService.createMessage`) with a new attachment `kind: 'STICKER'` and the sticker's `url`, so composer/permission/slowmode rules that already gate a message with an attachment apply unchanged — no new send-permission is introduced beyond the existing `SendMessages` check.
- Audit: `STICKER_CREATE` `{ name }`, `STICKER_DELETE` `{ name }`.
- Realtime: `server:stickers-updated` `{ serverId }` to `server:<id>`, mirroring `server:emojis-updated` (`custom-emoji.md:16,39`) exactly — same trigger points (create, delete), same "client refetches" contract.

### Soundboard — Rules

- Create: `MANAGE_SERVER`; `name` same pattern as stickers/emoji; `400 Soundboard limit reached` at 30 per server; the clip must be an uploaded audio URL (`audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/mp4` — the existing allowlist, `uploads.service.ts:16-20`) capped at 5 seconds and 512 KB, checked client-side before upload (same "client checks, server upload-size cap is the real backstop" pattern `custom-emoji.md:85` already accepts for its own size limit, since duration cannot be verified server-side without decoding the file, which this phase does not add).
- Delete: `MANAGE_SERVER`; `404` if not in that server.
- List: any member.
- **Trigger**: a member who is an authorized participant in the voice call for channel `X` (i.e., already passed `access.authorizeCallJoin` to join that call, same authorization `voice-sfu.md:16` requires before any call action) sends `soundboard:play` over the socket with a `clipId`; the server validates the clip belongs to the caller's server and broadcasts a `soundboard:played` event to `callRoom(X)` with `{ clipId, url, triggeredBy }`. **Every participant's own client plays the clip locally through the browser's `Audio` API** — this is not mixed into the call's media stream server-side, because there is no server-side media plane to mix into under the current mesh transport (see Current Behavior). Each client hearing its own local playback is therefore an approximation of "everyone hears it," not a guarantee: a participant with local audio muted still hears the soundboard sound (client plays it outside the WebRTC track entirely), and there is no synchronization guarantee closer than normal socket-broadcast latency.
- Rate limit: `soundboard:play` is limited to 10 triggers per 60s per user, following the existing per-socket-event rate limiting the voice gateway already applies to `voice:state` (`voice-sfu.md:47`, `30/60s`) and other events, scaled down since this is a lower-priority, spam-prone action.
- Audit: soundboard **playback** is not audited (it is a high-frequency, low-consequence social action, same tier as a reaction — reactions are not audited either, per `member-bans.md`/`server-events.md`'s audit lists never mentioning `MessageReaction`); only `SOUNDBOARD_CLIP_CREATE`/`SOUNDBOARD_CLIP_DELETE` are.

### Client

- `useServerStickers(serverId)` / `useServerSoundboard(serverId)`, following the exact shape of `useServerEmojis(serverId)` (`custom-emoji.md:43`).
- `StickerPicker`, a sibling to the existing `EmojiPicker` (`custom-emoji.md:45,79`), opened from the composer; inserts a sticker as an attachment on send rather than as inline text (unlike `:name:` emoji, which stays inline text per `custom-emoji.md:84`'s trade-off) — this is a deliberate difference: a sticker is a large, standalone visual the same way an uploaded image attachment is, not a small inline glyph.
- `MessageAttachment` rendering in `MessageRow`/`ThreadPanel` checks the new attachment `kind` and renders a sticker at a larger fixed size (e.g., 160px) than a regular image thumbnail, with `alt=<sticker name>`.
- Server settings gains "Stickers" and "Soundboard" sections, mirroring `ServerEmojiSection`'s file input / name field / list-with-delete / limit-counter layout (`custom-emoji.md:46,79`), rendered only for `MANAGE_SERVER` holders.
- A `SoundboardPanel` appears in the existing call UI (`CallStage`, referenced in `voice-sfu.md:29`) while a call is active: a grid of clip buttons; clicking one emits `soundboard:play`; receiving `soundboard:played` plays the clip locally via `new Audio(url).play()` and shows a small toast/indicator naming who triggered it.

## Technical Approach

### Data model

```prisma
model ServerSticker {
  id        String   @id @default(cuid())
  serverId  String
  name      String
  url       String
  creatorId String
  createdAt DateTime @default(now())
  server    Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  creator   User   @relation("StickerCreator", fields: [creatorId], references: [id])

  @@unique([serverId, name])
}

model SoundboardClip {
  id        String   @id @default(cuid())
  serverId  String
  name      String
  url       String
  creatorId String
  createdAt DateTime @default(now())
  server    Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  creator   User   @relation("SoundboardClipCreator", fields: [creatorId], references: [id])

  @@unique([serverId, name])
}
```

`MessageAttachment` gains `kind AttachmentKind @default(FILE)` with `enum AttachmentKind { FILE STICKER }`, additive with a default so every existing row is unaffected.

Migration `20260917030000_add_stickers_and_soundboard`.

### API

| Method   | Path                                     | Body            | Response                                                       | Rate limit |
| -------- | ---------------------------------------- | --------------- | -------------------------------------------------------------- | ---------- |
| `GET`    | `/servers/:serverId/stickers`            | —               | `{ stickers: Array<{ id, name, url, creatorId, createdAt }> }` | default    |
| `POST`   | `/servers/:serverId/stickers`            | `{ name, url }` | `201 { sticker }`                                              | 20/min     |
| `DELETE` | `/servers/:serverId/stickers/:stickerId` | —               | `{ ok: true }`                                                 | 20/min     |
| `GET`    | `/servers/:serverId/soundboard`          | —               | `{ clips: Array<{ id, name, url, creatorId, createdAt }> }`    | default    |
| `POST`   | `/servers/:serverId/soundboard`          | `{ name, url }` | `201 { clip }`                                                 | 20/min     |
| `DELETE` | `/servers/:serverId/soundboard/:clipId`  | —               | `{ ok: true }`                                                 | 20/min     |

Sending a sticker reuses `POST /channels/:channelId/messages` (`messages.controller.ts:65-71`) — the client attaches `{ fileName, mimeType, byteSize: 0, url, kind: 'STICKER' }` in `attachments`, so `CreateMessageDto`'s attachment shape gains an optional `kind` field defaulting to `'FILE'`.

### Realtime

- `server:stickers-updated` `{ serverId }` → `server:<id>`, on create/delete (mirrors `server:emojis-updated`).
- `server:soundboard-updated` `{ serverId }` → `server:<id>`, on create/delete.
- New socket handler in `voice.gateway.ts`: `@SubscribeMessage('soundboard:play')`, body `{ channelId, clipId }` — validates the caller is a current participant in `callRoom(channelId)` (reusing the existing call-membership check pattern the gateway already applies before `voice:state`/`webrtc:*` actions, `voice-sfu.md:47-49`), looks up the clip's `url`, and does `this.publisher.emitToRoom(this.calls.callRoom(channelId), 'soundboard:played', { clipId, url, triggeredBy: { id, displayName } })`.

### Files

- API: `modules/stickers/stickers.module.ts`, `stickers.controller.ts`, `stickers.service.ts`, `dto/create-sticker.dto.ts`; `modules/soundboard/soundboard.module.ts`, `soundboard.controller.ts`, `soundboard.service.ts`, `dto/create-clip.dto.ts`; `modules/messages/dto/create-message.dto.ts` (`kind` on attachment input); `modules/realtime/voice.gateway.ts` (`soundboard:play` handler); `prisma/schema.prisma`; `app.module.ts`.
- Web: `api.ts`, `hooks/useServerStickers.ts`, `useServerSoundboard.ts`, `components/chat/StickerPicker.tsx`, `MessageRow.tsx` / `ThreadPanel.tsx` (sticker-kind rendering), `components/settings/ServerStickerSection.tsx`, `ServerSoundboardSection.tsx`, `ServerSettings.tsx`, `components/call/SoundboardPanel.tsx` (new, alongside whatever the existing call UI component is named — not fully located for this doc, see Open Questions), `AppShell.tsx`, `i18n/locales/en.ts` / `vi.ts`.

## Trade-offs

- **Client-local soundboard playback vs. waiting for `voice-sfu.md` to mix it server-side**: the task asks for soundboard "played into voice channel via SFU," but no SFU exists in this repo yet — mesh WebRTC is the current, deliberate baseline (`voice-sfu.md:62-64`). Shipping soundboard now as a client-local `Audio()` play triggered by a socket broadcast delivers the visible/audible feature immediately and matches how a Discord-style soundboard actually plays for the triggering user's own speakers in many mesh-era implementations, at the cost of it not being a true "server injects this into everyone's received audio track" experience (a deafened/muted-output participant still hears it, and it is not carried over the same encrypted/media-quality path as voice). Once `voice-sfu.md` ships, `soundboard:play` can be extended to have the SFU inject the clip as a server-side audio source into the room, which is a strictly additive change to the same event (the client-received `soundboard:played` broadcast can stay for a visual "X played Y" indicator either way). This is called out as a real limitation, not silently glossed over.
- **`ServerSticker`/`SoundboardClip` as two new tables vs. extending `ServerEmoji` with a `kind` column**: a shared table would need a discriminator plus type-specific fields growing awkwardly (soundboard clips have no rendering-as-inline-text concept; stickers are never played as audio), and the 50/30/30 caps and audit action names are already different per type in the acceptance criteria — two small, focused tables following the exact shape `custom-emoji.md` already established are more readable than one overloaded table with conditional fields.
- **`MessageAttachment.kind` vs. a separate `StickerMessage` join table**: a sticker-in-a-message is genuinely still an attachment (an image the message carries), so extending the existing generic attachment model with a discriminator column reuses every existing attachment query, rendering path, and cascade-delete behavior; a parallel table would duplicate all of that for one extra field's worth of distinction.
- **No animated stickers in this phase**: matches `custom-emoji.md`'s own precedent of deferring "animated emoji controls" (`custom-emoji.md:21`); APNG/Lottie playback and larger asset sizes are a meaningfully bigger client-rendering and storage-size question than this doc's static-image slice.

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- **Migration** is `20260917014000_add_stickers_and_soundboard`, not `20260917030000`. Both tables carry `mimeType` and `byteSize`; `SoundboardClip` also stores `durationMs`.
- **No `AttachmentKind` enum.** `MessageAttachment.kind` was already a nullable string from voice messages, so a sticker row is `kind: 'sticker'` (`STICKER_ATTACHMENT_KIND`) plus a new nullable `stickerId` with `ON DELETE SET NULL`, on both `MessageAttachment` and `DirectMessageAttachment` (`apps/api/prisma/models/messages.prisma`, `direct-messages.prisma`).
- **Sending uses `stickerId`, not a client-built attachment.** `CreateMessageDto.stickerId` (REST and the socket `message:create` / `thread:message:create` bodies) is resolved by `messages/message-stickers.ts` against the destination channel's server; a sticker of another server is `404 Sticker not found`. A request can never send `kind: 'sticker'` in `attachments` itself.
- **Deleted sticker**: the attachment row stays, `formatAttachment` returns `url: ''` and `sticker: null`, and the client renders a "Sticker deleted" placeholder instead of the old image.
- **Uploads are multipart, not `{ name, url }`.** `POST /servers/:serverId/stickers` takes `name` plus a `file` part (512 KB); `POST /servers/:serverId/soundboard` takes `name`, `durationMs` and a `file` part (512 KB). The API ignores the client MIME type and file name, sniffs the leading bytes (`uploads/file-signature.ts`: PNG/WEBP for stickers; MP3, OGG, WAV, WEBM, M4A for clips) and stores the file through `UploadsService.uploadBuffer`. `durationMs` is measured in the uploader's browser and only range-checked (1–5000 ms) by the API.
- **Forwarding carries stickers.** A forwarded sticker message copies the attachment row with the source `stickerId`, into channels and DMs. This is the only way a sticker reaches a DM; the DM composer has no sticker picker.
- **Soundboard play** checks, on every play: not a DM call (`dm:` ids are refused), the socket is a participant in the call registry, membership, not timed out, and rules accepted. `soundboard:played` carries `{ channelId, clipId, name, url, triggeredBy }`. The rate limit is 10 per 60 s, as designed.
- **Client**:
  - Clicking a sticker in the composer picker sends it at once as its own message, keeping the draft text and the reply target, like Discord. It is not queued with the draft.
  - The thread panel renders sticker messages, and its composer has the same sticker picker; a sticker is sent as its own thread reply through `POST /messages/:messageId/thread/messages` with `stickerId`.
  - Playback is mounted once in the app shell (`hooks/useSoundboardPlayback.ts`), so a participant hears clips while the call panel is off screen. The call header shows "X played Y" for 4 s, plus a note when the browser blocked playback.
  - The soundboard button shows in the call controls only while the call's own channel is open, because the panel needs that channel's server.
  - Settings gain "Stickers" and "Soundboard" sections (`ServerStickersSection`, `ServerSoundboardSection`) that load their own data instead of being passed through `AppShell`.
- **Account export** includes the stickers and soundboard clips the user created.
- **Known gap**: deleting a sticker or clip does not delete its file from upload storage, the same as custom emoji; `UploadsService` has no delete operation.

## Risks & Rollback

- **Risk**: soundboard playback is not synchronized or guaranteed-audible for every participant (see Trade-offs) — this is a real, documented gap, not a bug to fix silently later without updating this doc when `voice-sfu.md` changes the story.
- **Risk**: a member spamming `soundboard:play` is rate-limited per user (10/60s) but a call with several members each at the cap can still produce a noisy call; no per-call aggregate limit is designed here.
- **Risk**: sticker/soundboard uploads share the same upload endpoint and size cap as every other upload (`uploads.service.ts`); a malicious "sticker" that is actually an oversized or wrong-MIME file is already rejected by the existing allowlist, so this doc adds no new upload-security surface beyond what `custom-emoji.md:90` already accepts (any member can reference any uploaded URL in an attachment; creation itself is what is permission-checked).
- **Rollback**: revert code; the migration is additive (two new tables, one new enum column with a default) — no backfill, no data loss on rollback. Existing messages and calls are unaffected since `MessageAttachment.kind` defaults to `FILE`.

## Test Plan

Not covered by automated tests per `RULE.md:77`. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check`.

- **Manual — stickers**: upload `wave.png` as sticker `wave` → open the sticker picker in the composer → send it → message renders the sticker at the larger fixed size for another open client live; delete the sticker → it disappears from the picker for new messages but the already-sent message still renders the image.
- **Manual — soundboard**: upload a 2-second `.mp3` clip named `airhorn` → join a voice call with two clients → trigger `airhorn` from client A → client B's browser plays the clip and shows the "A played airhorn" indicator; client A's own client also plays it locally.
- **Manual — limits**: create 30 stickers, then attempt a 31st → `400 Sticker limit reached`.
- **Failure case**: a member without `MANAGE_SERVER` calls `POST /servers/:id/stickers` → `403`; a member not currently in the voice call for a channel sends `soundboard:play` for that channel → rejected the same way an unauthorized `voice:state` call already is.

## Deployment Notes

- Run migration `20260917014000_add_stickers_and_soundboard` before deploying the API.
- New i18n keys ship in both `en` and `vi` in the same change, per `docs/features/i18n-localization.md:11`.
- No new env var; uploads reuse the existing Cloudinary-backed upload pipeline and its existing size/type configuration.
- This doc's soundboard design should be revisited (not silently left stale) once `voice-sfu.md` ships, per the Trade-offs note on server-side mixing.
