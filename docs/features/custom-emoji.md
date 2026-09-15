# Feature Spec: Server Custom Emoji

Server-specific image emoji usable in messages and reactions.

## Goal

Members with `MANAGE_SERVER` upload named emoji for a server; every member can insert them in messages and reactions in that server's channels.

Acceptance criteria:

- Names match `^[a-zA-Z0-9_]{2,32}$` and are unique per server (case-sensitive); a server holds at most 50 emoji.
- The image must be an uploaded PNG, GIF, WEBP, or JPEG URL; the client refuses files over 256 KB before uploading.
- `:name:` in a channel message renders the image when that server has the emoji; otherwise the text stays.
- Reactions accept `:name:` and render the image.
- The reaction picker and a new composer emoji button list the server's emoji.
- Adding or deleting emoji updates open clients through `server:emojis-updated`.

## Scope

- **In scope**: emoji model, list/create/delete endpoints, settings section, rendering in messages and reactions, picker in reactions and composer.
- **Out of scope**: emoji in DMs, animated emoji controls, `:` autocomplete while typing, emoji rename, stable references that survive deletion.

## Current Behavior

- Reactions are Unicode strings up to 32 characters (`messages/dto/reaction.dto.ts`).
- The reaction popover shows a fixed Unicode list (`components/chat/MessageRow.tsx:40`).
- The composer has no emoji picker (`components/chat/MessageComposer.tsx`).
- Uploads return a URL validated by pattern; upload metadata is not persisted (`uploads.service.ts`).

## Changes

### Rules

- Create: `MANAGE_SERVER`; name validation; `409 Emoji name already exists`; `400 Emoji limit reached`; URL must match the uploaded image pattern.
- Delete: `MANAGE_SERVER`; `404` if the emoji is not in that server. Messages and reactions that used the name fall back to text.
- List: any member.
- Reaction emoji length limit raised from 32 to 64 characters so `:name:` fits.
- Audit: `EMOJI_CREATE` `{ name }`, `EMOJI_DELETE` `{ name }`.
- Realtime: `server:emojis-updated` `{ serverId }` to `server:<id>` after create or delete; clients refetch.

### Client

- `useServerEmojis(serverId)` loads and refreshes the list; `ServerEmojiContext` exposes `resolveEmoji(name)` to message rows.
- `MarkdownContent` renders resolved `emoji` nodes as 22px images with `alt=":name:"`.
- `EmojiPicker` component: Unicode list plus a "Server emoji" section; used by the reaction popover and the composer (inserts at the end of the draft with a trailing space).
- Server settings "Emoji" section: file input, name field (prefilled from the file name), list with delete, loading/empty/error states, limit counter.

## Technical Approach

### Data model

```prisma
model ServerEmoji {
  id        String   @id @default(cuid())
  serverId  String
  name      String
  url       String
  creatorId String
  createdAt DateTime @default(now())
  server    Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  creator   User   @relation("EmojiCreator", fields: [creatorId], references: [id])

  @@unique([serverId, name])
}
```

Migration `20260915006000_add_server_emojis`.

### API

| Method | Path | Body | Response | Rate limit |
| --- | --- | --- | --- | --- |
| `GET` | `/servers/:serverId/emojis` | — | `{ emojis: Array<{ id, name, url, creatorId, createdAt }> }` | default |
| `POST` | `/servers/:serverId/emojis` | `{ name, url }` | `201 { emoji }` | 20/min |
| `DELETE` | `/servers/:serverId/emojis/:emojiId` | — | `{ ok: true }` | 20/min |

### Files

- API: `modules/emojis/emojis.module.ts`, `emojis.controller.ts`, `emojis.service.ts`, `dto/create-emoji.dto.ts`, `app.module.ts`, `messages/dto/reaction.dto.ts`.
- Web: `api.ts`, `hooks/useServerEmojis.ts`, `contexts/ServerEmojiContext.tsx` (provided in `components/app/AuthenticatedWorkspace.tsx`), `components/chat/EmojiPicker.tsx` (+ test; also exports `ReactionEmoji`), `MessageRow.tsx`, `ThreadPanel.tsx`, `MessageComposer.tsx` (+ one grid column in `MessageComposer.module.css`), `MarkdownContent.tsx`, `components/settings/ServerEmojiSection.tsx`, `ServerSettings.tsx`, `AppShell.tsx`. The emoji section only renders for members with `MANAGE_SERVER`.

## Trade-offs

- **Name-based `:name:` vs. id-based `<:name:id>` references**: names keep message content readable for search and E2EE channels and need no composer transformation. Cost: deleting or re-creating an emoji changes what old messages show.
- **Client-side size limit**: uploads are not tracked in the database, so the server cannot check the stored size from a URL. The general upload limit still applies server-side; a tracked upload table is a separate change.
- **Separate list endpoint vs. embedding in `GET /servers/:id`**: keeps the server payload unchanged and lets emoji refresh without reloading channels and members.

## Risks & Rollback

- **Risk**: a member without `MANAGE_SERVER` can still reference any uploaded image URL in a message attachment; emoji creation itself is permission-checked.
- **Rollback**: revert code; the migration is additive. Existing `:name:` text remains readable.

## Test Plan

- **Automated**: `emojis.int.test.ts` (permission, duplicate name, limit, cross-server delete refused); web tests for emoji node resolution in `MarkdownContent` and picker insertion.
- **Manual**: upload `party.gif` as `party` → send `hello :party:` → image renders for another member live; react with it; delete it → message shows `:party:` text.

## Deployment Notes

- Run migration `20260915006000_add_server_emojis` before deploying the API.
