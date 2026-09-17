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

Decision (open question 21): the post title and tags live on `Thread`, not on the root `Message`, and tags are a normalized per-channel table instead of a `String[]` column.

```prisma
enum ChannelType {
  TEXT
  VOICE
  FORUM
}

model Channel {
  // ...existing fields unchanged...
  postGuidelines String?
  forumTags      ForumTag[]
}

model Thread {
  // ...existing fields unchanged...
  /// Set only on a forum post; a thread started from a reply has no title.
  title String?
  tags  ThreadTag[]
}

model ForumTag {
  id        String      @id @default(cuid())
  channelId String
  name      String
  position  Int         @default(0)
  createdAt DateTime    @default(now())
  channel   Channel     @relation(fields: [channelId], references: [id], onDelete: Cascade)
  threads   ThreadTag[]

  @@unique([channelId, name])
  @@index([channelId, position])
}

model ThreadTag {
  threadId String
  tagId    String
  thread   Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  tag      ForumTag @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([threadId, tagId])
  @@index([tagId])
}
```

A forum post _is_ a `Thread` with a non-null `title` whose channel is a `FORUM` channel. `ThreadParticipant`, reply storage, and `ThreadPanel` are reused unchanged.

New migration: `20260917009000_add_forum_channels` — adds the `FORUM` enum value, `Channel.postGuidelines`, `Thread.title`, and the two tables. Every new column is nullable and the tables are new, so existing rows need no backfill. The migration never uses the `FORUM` value, so `ALTER TYPE ... ADD VALUE` stays valid inside Prisma's migration run on PostgreSQL 12+ (the repository runs 16).

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

| Option                                             | Pros                                                                                                  | Cons                                                                                | Verdict                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Title and tags on `Thread`                         | The post is the thread; listing and sorting read one table; the root message stays a plain `Message`  | A nullable `title` on every thread                                                  | **Chosen** (open question 21)                                                                       |
| Title and tags on the root `Message`               | No `Thread` change                                                                                    | Every message row carries post-only columns; listing joins back to the root message | Ruled out                                                                                           |
| Normalized `ForumTag` + `ThreadTag` vs. `String[]` | Renaming a tag updates every post at once; deleting a tag cascades; the per-post limit is a row count | Two tables and a replace-set endpoint instead of one array column                   | **Chosen** over the `String[]` row above, which could not rename a tag without rewriting every post |

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- **Title and tags storage** (open question 21): `Thread.title` plus normalized `ForumTag`/`ThreadTag` tables, as in Data model above, instead of `Channel.tags String[]`. Tag names are unique per channel case-insensitively (checked by `ForumTagsService`; the database index is case-sensitive). Migration `20260917009000_add_forum_channels`.
- **Tags have their own endpoints**, because a normalized tag carries an id: `GET /channels/:channelId/forum-tags` (anyone who can view the channel) and `PUT /channels/:channelId/forum-tags` with the full set `{ tags: [{ id?, name }] }` (`MANAGE_CHANNELS`). An entry with an id renames and reorders that tag, one without creates a tag, and a stored tag left out is deleted and drops off every post. Unknown ids return `404 Forum tag not found`; duplicate names `400 Forum tag names must be unique`. The change is audited as `FORUM_TAGS_UPDATE`. `PATCH /channels/:channelId` carries only `postGuidelines` (refused with `400 Channel is not a forum channel` on other types; blank clears it), and `POST /servers/:serverId/channels` accepts `type: 'FORUM'` and `postGuidelines` but not tags.
- **Post request and response.** `POST /channels/:channelId/forum-posts` takes `{ title, tagIds?, content, attachments? }` (tag ids, not names) and returns `201 { thread, rootMessage }`; an unknown tag id returns `400 Unknown forum tag`, a blank title `400 Forum post title is required`. It is rate-limited (10 per minute) and audited as `FORUM_POST_CREATE`. `GET /channels/:channelId/forum-posts?cursor=&tagId=` returns `{ posts: ForumPostView[], nextCursor }` with `ForumPostView = { thread, rootMessage }` rather than bare `ThreadSummary[]`, because the card needs the author and excerpt and `ThreadPanel` opens from the root message. Pages hold 25 posts; the cursor is the last thread id, so a post that gains a reply while paging can move to an earlier page. Posts whose root message was deleted are not listed. Both endpoints refuse a non-forum channel with `400 Channel is not a forum channel`.
- **`ThreadSummary` gains `title` and `tags`** (null and empty on reply-originated threads), so thread events and the thread panel header show the post title.
- **Code placement.** Forum logic lives in `apps/api/src/modules/forum/` (`ForumPostsService`, `ForumTagsService`, `ForumController`), not in `messages.service.ts`, which is kept well under the file-size limit. `MessagesService` gains only `requireCanPostInForum`, `listThreadRoots`, and a public `notifyMentionedUsers`; `ChannelsService` gains `requireReadableForumChannel`.
- **Send chain.** A post goes through the same gates as any top-level send: view, `SEND_MESSAGES`, timeout, rules screening (onboarding), and slowmode (the root post is a top-level message, so the channel slowmode spaces posts), then AutoMod screening of the title and body together. Replies use `createThreadMessage` unchanged, which already applies onboarding and AutoMod.
- **Top-level messages in a FORUM channel are refused in one place.** `MessagesService.requireCanPostInChannel` throws `400 Use forum posts on a FORUM channel` right after the view check, so every path that uses it is covered: socket `message:create` (acknowledged with the error), REST `POST /channels/:channelId/messages`, forwarding into a channel, scheduled channel sends at send time, and channel polls. Scheduling a message into a forum channel is also refused up front in `ScheduledMessagesService.createForChannel` with the same message. No scheduled-send failure code was added: a channel's type cannot change and no forum channel existed before this migration, so a pending scheduled message can never target one; if it somehow did, the sweep would record `REJECTED`. AutoMod alert channels were already restricted to `TEXT` (`automod.service.ts`).
- **`GET /channels/:channelId/messages` still answers on a FORUM channel** (it returns the root posts). The web client does not render it, but the existing channel open flow uses it to mark the channel read, and channel search runs on it.
- **Realtime.** `forum:post-created` carries `{ thread, rootMessage }`; the post also sends `unread:updated` to viewers like a channel send. The web list invalidates its query on `forum:post-created`, `thread:message:created`, `message:updated`, `message:deleted` and `thread:message:deleted` for the channel instead of splicing the cache, because the activity order and per-viewer fields make a refetch of one page simpler and correct.
- **Unread.** `RealtimeUnreadService.countByChannel` now counts `FORUM` channels with `TEXT`. As for text channels today, replies count toward the badge on reload but do not push a live `unread:updated`.
- **Account export** adds `forumPostTitle` to each exported message that is a forum post root.
- **Web.** `components/forum/ForumChannelView.tsx`, `ForumPostCard.tsx`, `NewForumPostDialog.tsx` replace the message list, typing line and composer inside `ChatPanel.tsx` for a FORUM channel (`AppShell.tsx` is unchanged). Forum channels are listed with text channels and use the `MessagesSquare` icon; managers create one from the server menu ("Create forum channel"). Channel settings add a post guidelines field and `components/settings/ForumTagsSection.tsx`, which saves the tag set on its own. The "New post" button is shown to everyone who can view the channel and disabled only while timed out: the client has no channel-override evaluation, so a missing `SEND_MESSAGES` override shows the API's `403` in the dialog instead of hiding the button. The post form's attachments use `uploadMessageAttachments` with a plain file picker, not the full composer (no voice recording, no slash commands, no encryption).
- **Not covered for forum posts:** post deletion, reactions, pins, saving and reporting have no entry point in the forum view or the thread panel (the thread panel had none before either); the API endpoints work on root and reply messages as for any thread. Channel search results cannot jump to a post, because there is no message list to scroll. Title and tags cannot be edited after creation, as specified.

## Risks & Rollback

- **Risk**: `FORUM` is a new `ChannelType` enum value — any web code that pattern-matches on `'TEXT' | 'VOICE'` without a default case (e.g. a `switch` with no `default`) will silently mis-render a forum channel until audited; `ChannelSidebar.tsx:92` and any similar type-narrowing call sites must be checked, not just the ones this doc names.
- **Risk**: sorting by `Thread.updatedAt` means a single popular reply thread can dominate the top of the list indefinitely; no "sort by newest post" alternative is specified here.
- **Rollback**: revert code; the migration only adds an enum value and two nullable/defaulted columns, so it is additive and does not need a down-migration beyond dropping them.

## Test Plan

- **Automated**: none — `RULE.md` forbids `*.test.ts`/`*.spec.ts` files. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:file-size`, `npm run i18n:check`, `npm run ui:scan`, `npm run docs:check`.
- **Manual**:
  1. Manager opens the server menu → "Create forum channel" → opens its settings, adds tags `bug` and `idea`, saves tags, sets post guidelines, saves.
  2. A member with `SEND_MESSAGES` → "New post" → guidelines show under the dialog title → title, tag `bug`, message, one image → post appears at the top with its tag; other members see it appear without reload and get an unread badge.
  3. A second member opens the post, replies in the thread panel (header shows the post title) → the post moves to the top and its reply count increments.
  4. Filter by `idea` → "No posts with this tag."; rename `bug` in settings → the card shows the new name; delete it → the tag disappears from the post.
  5. Failure cases: `POST /channels/:channelId/forum-posts` with a tag id from another channel → `400 Unknown forum tag`; `POST /channels/:channelId/messages`, socket `message:create`, `POST /channels/:channelId/polls`, a forward into the forum channel, and `POST /channels/:channelId/scheduled-messages` → `400 Use forum posts on a FORUM channel`; a member denied `SEND_MESSAGES` by an override → `403` shown in the dialog; a timed-out member → "New post" disabled; an AutoMod keyword in the title → blocked; a member who has not accepted the rules → `403`.

## Deployment Notes

- Run migration `20260917009000_add_forum_channels` before deploying the API. It adds an enum value and never uses it in the same migration, so it is valid on PostgreSQL 12+; deploy the schema first, then the code that writes `FORUM` rows.
- New API error codes and `forum.*` web keys land in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
- Deploy API before web: an older API rejects `type: 'FORUM'` at channel creation, so the new web client's forum menu would fail against it.
