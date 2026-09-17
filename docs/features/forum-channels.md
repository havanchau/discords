# Feature Spec: Forum Channels

A `FORUM` channel type where each top-level post is a `Thread` instead of a `Message`, browsable and sortable like a forum board instead of a flat message log.

## Goal

Members with `SEND_MESSAGES` on the channel create a tagged post (title + first message); other members reply inside that post's thread; the channel lists posts sorted by recent activity instead of showing a flat message feed.

Acceptance criteria:

- `POST /channels/:channelId/forum-posts` on a `FORUM` channel creates a `Thread` rooted at a new `Message`, with a required title and 0-5 tags drawn from the channel's configured tag set.
- `GET /channels/:channelId/forum-posts` returns posts sorted by `updatedAt` descending (most recent reply first), paginated, with reply count and tags — mirroring `ThreadSummary` (`packages/shared/src/types.ts`, formatted by `formatThreadSummary` at `apps/api/src/modules/messages/messages.service.ts:619`).
- Replying inside a post reuses `createThreadMessage` (`messages.service.ts:276`) unchanged; a reply bumps the thread's `updatedAt`, which changes the post's sort position.
- A `FORUM` channel's root channel view (the one `GET /channels/:channelId/messages` currently serves for `TEXT`) is not used; forum posts have no channel-level message list.
- Members without `VIEW_CHANNEL` on the channel cannot see any post or reply, enforced the same way as any other channel (`hasChannelPermission`, `permissions.service.ts:79`).
- Creating a channel with `type: 'FORUM'` and an optional `postGuidelines` and `tags` list is audited like any other channel create (`CHANNEL_CREATE`, `channels.service.ts:33`).

## Scope

- **In scope**: `FORUM` channel type, forum post creation (title + tags + first message as a `Thread`), post listing sorted by activity, a per-channel tag set, optional post guidelines text shown above the composer, permission reuse via existing channel overrides.
- **Out of scope**: pinned/featured posts, marking a post as answered/resolved, forum-specific reactions or voting, tag-based filtering UI beyond a simple client-side filter, migrating existing `TEXT` channels into `FORUM` channels, moderation tools beyond the existing `MANAGE_MESSAGES`/`MANAGE_CHANNELS`.

## Current Behavior

- `ChannelType` is `TEXT | VOICE` (`apps/api/prisma/schema.prisma:18-21`); `CreateChannelDto.type` only accepts `'TEXT' | 'VOICE'` (`apps/api/src/modules/channels/dto/create-channel.dto.ts:9-10`); the shared type mirrors it (`packages/shared/src/types.ts:2`).
- `Thread` already models a "root message + replies" shape: `Thread.rootMessageId` is unique on `Message` (`schema.prisma:377-393`), and `ThreadParticipant` tracks per-user `lastReadAt` (`schema.prisma:395-401`). Today a thread is only created as a side effect of replying to a channel message (`createThreadMessage`, `messages.service.ts:276-364`) — there is no "start a thread directly" entry point.
- `ChannelSidebar.tsx:92` branches rendering only on `item.type === 'VOICE'`; every non-voice channel renders as a flat text channel row today.
- `evaluateChannelPermission` (`apps/api/src/modules/permissions/channel-permission.ts:44-76`) is channel-type-agnostic — it only looks at `channel.id` and `channel.isPrivate`, so it already works unchanged for any new channel type.
- No tag concept exists anywhere in the schema or shared types.

## Changes

### Rules

- `FORUM` is a new `ChannelType` value alongside `TEXT` and `VOICE`.
- A `FORUM` channel gains two new nullable-safe fields: `tags: string[]` (channel-level, 0-20 entries, each 1-30 characters, unique case-insensitively within the channel) and `postGuidelines: String?` (0-2000 characters), both managed via `PATCH /channels/:channelId` by `MANAGE_CHANNELS`, same guard as any other channel update (`channels.service.ts:65-68`).
- Creating a post requires `SEND_MESSAGES` on the channel (same permission `createThreadMessage` already requires) and `requireNotTimedOut` (same call already used at `messages.service.ts:281`).
- Post `title`: 1-100 characters after trim, required. Post `tags`: 0-5 entries, each must exist in the channel's `tags` set (`400 Unknown tag` otherwise).
- The post's first message follows the same empty-content rule already enforced for thread replies (`messages.service.ts:284-286`): content or an attachment is required.
- Editing a post's title/tags after creation is out of scope for this doc (only the root message's content is editable, via the existing `updateMessage` path).
- Non-`FORUM` channels reject `title`/`tags` on message create (`400`); `FORUM` channels reject direct `POST /channels/:channelId/messages` (`400 Use forum posts on a FORUM channel`) — a forum channel has no flat message list to post into.

### Client

- Channel sidebar: a `FORUM` channel renders with a new icon (mirrors the `item.type === 'VOICE'` branch at `ChannelSidebar.tsx:92`) and opens a post list view instead of the chat composer.
- Post list view: cards sorted by activity (most recent reply first), each showing title, tags, reply count, and last-activity time — the same fields `ThreadPanel.tsx` already renders for a thread summary, reused rather than rebuilt.
- "New post" button (visible only when the caller can send messages, mirrored client-side from the server check) opens a form: title, tag picker (limited to the channel's configured tags), message composer identical to the existing one, reusing the existing attachment upload flow.
- Opening a post reuses `ThreadPanel.tsx` unchanged — a forum post's thread has the same `ThreadSummary` shape as a from-a-reply thread.
- Channel settings gains a "Forum tags" list editor and a "Post guidelines" textarea, gated on `MANAGE_CHANNELS` like the rest of channel settings.

## Technical Approach

### Data model

```prisma
enum ChannelType {
  TEXT
  VOICE
  FORUM
}

model Channel {
  // ...existing fields unchanged...
  tags           String[] @default([])
  postGuidelines String?
}
```

`Thread` and `ThreadParticipant` are reused as-is — no new columns. A forum post _is_ a `Thread` whose `rootMessage.channelId` points at a `FORUM` channel; nothing distinguishes it structurally from a reply-originated thread except that its root message was created through the new forum-post endpoint instead of `createMessage`.

New migration: `<timestamp>_add_forum_channels` — adds the `FORUM` enum value and the two `Channel` columns (`tags` defaults to `[]`, `postGuidelines` nullable, so existing rows need no backfill).

### API

| Method | Path                               | Body                                                | Response                                  |
| ------ | ---------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `POST` | `/channels/:channelId/forum-posts` | `{ title, tags?: string[], content, attachments? }` | `201 { thread, rootMessage }`             |
| `GET`  | `/channels/:channelId/forum-posts` | query: `cursor?, tag?`                              | `{ posts: ThreadSummary[], nextCursor? }` |
| `POST` | `/threads/:rootMessageId/messages` | _(existing, unchanged)_                             | _(existing, unchanged)_                   |

Reuses the existing thread-reply endpoint and `ThreadSummary` shape (`packages/shared/src/types.ts`, formatted by `formatThreadSummary`, `messages.service.ts:619-637`) instead of inventing a parallel "post" shape.

### Realtime

- Reuses the existing `thread:message:created` / `thread:message:updated` / `thread:message:deleted` events (`messages.service.ts:347`, `:399`, `:434`) unchanged — a reply inside a forum post is a reply inside a thread, nothing new to broadcast there.
- New event `forum:post-created` emitted to `channel:<channelId>` so open post-list views can prepend the new post without a full refetch, following the realtime rule "include enough payload data for clients to update cache without a full refetch" (`RULE.md`).

### Files

- API: `apps/api/prisma/schema.prisma`, new migration, `apps/api/src/modules/channels/dto/create-channel.dto.ts` and `update-channel.dto.ts` (`tags`, `postGuidelines`), `apps/api/src/modules/messages/messages.service.ts` (new `createForumPost`, `listForumPosts`; `createMessage` gains the `FORUM`-channel rejection), `apps/api/src/modules/messages/messages.controller.ts`, new `dto/create-forum-post.dto.ts`, `apps/api/src/modules/realtime/messages.gateway.ts` (or wherever `thread:message:created` is emitted) for `forum:post-created`.
- Web: `apps/web/src/api.ts` (forum post types + calls), `apps/web/src/components/workspace/ChannelSidebar.tsx` (icon + routing branch), new `apps/web/src/components/forum/ForumPostList.tsx`, `ForumPostCard.tsx`, `NewForumPostDialog.tsx`, reuse of `apps/web/src/components/chat/ThreadPanel.tsx`, `apps/web/src/i18n/locales/en.ts` / `vi.ts` (new `forum.*` keys), channel settings component for tags/guidelines.

## Trade-offs

| Option                                                           | Pros                                                                                                                                              | Cons                                                                                                                                                                                                                     | Verdict                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Reuse `Thread`/`ThreadParticipant` for posts                     | No new participant/read-state model; `ThreadPanel.tsx` and unread logic work unchanged; smallest schema diff                                      | A forum post and a reply-originated thread are structurally identical, so a bug in one silently affects the other                                                                                                        | **Chosen** — the existing thread model already is "root message + replies," which is exactly what a forum post needs |
| New `ForumPost` model separate from `Thread`                     | Clean domain separation; posts could gain post-only fields (title, tags) without touching `Thread`                                                | Duplicates reply storage, read-state, and the whole `ThreadPanel` UI; two code paths to keep in sync for something functionally identical                                                                                | Ruled out — the duplication cost is not justified since `Thread` has no post-incompatible constraint                 |
| Channel-level `tags: String[]` vs. a normalized `ForumTag` table | Simple, one migration, matches the repo's existing preference for `String[]` columns (`Role.permissions`, `ChannelPermissionOverride.allow/deny`) | No tag reuse across channels/servers, no tag color/description, renaming a tag requires updating every post that used it (out of scope: tags are not stored per-post beyond the array on the message/thread — see below) | **Chosen** for v1; a normalized table is a natural follow-up if tag reuse across channels becomes a real requirement |

**Open design gap acknowledged**: this doc reuses `Thread` but `Thread` has no `title` or `tags` columns today. The technical approach above does not add them to `Thread`, which is an inconsistency worth flagging — see `open-questions.md` for how title/tags should actually be stored (new `Thread.title`/`Thread.tags` columns is the likely answer, not covered in the Data model section above pending that decision).

## Risks & Rollback

- **Risk**: `FORUM` is a new `ChannelType` enum value — any web code that pattern-matches on `'TEXT' | 'VOICE'` without a default case (e.g. a `switch` with no `default`) will silently mis-render a forum channel until audited; `ChannelSidebar.tsx:92` and any similar type-narrowing call sites must be checked, not just the ones this doc names.
- **Risk**: sorting by `Thread.updatedAt` means a single popular reply thread can dominate the top of the list indefinitely; no "sort by newest post" alternative is specified here.
- **Rollback**: revert code; the migration only adds an enum value and two nullable/defaulted columns, so it is additive and does not need a down-migration beyond dropping them.

## Test Plan

- **Automated**: none — `RULE.md` forbids `*.test.ts`/`*.spec.ts` files. Verify with `npm run typecheck`, `npm run lint`, `npm run build`.
- **Manual**:
  1. Manager creates a `FORUM` channel with tags `bug`, `idea` → member without `SEND_MESSAGES` override cannot see "New post" → member with the permission creates a post tagged `bug` → post appears in the list.
  2. A second member replies inside the post → post moves to the top of the list (activity sort) and reply count increments.
  3. Failure case: creating a post with a tag not in the channel's tag set returns `400 Unknown tag`; posting directly to `POST /channels/:channelId/messages` on a `FORUM` channel returns `400`.

## Deployment Notes

- Run the new migration before deploying the API (adds an enum value — Postgres requires it to be committed before it can be used by a subsequent statement in the same deploy, so deploy schema first, then the code that writes `FORUM` rows).
- New `forum.*` i18n keys land in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
