# Feature Spec: Channel Categories

Named, ordered, collapsible groups of channels in the channel sidebar.

## Goal

Members with `MANAGE_CHANNELS` can create, rename, reorder, and delete categories and place channels in them; everyone sees the sidebar grouped by category.

Acceptance criteria:

- Categories belong to one server and sort by `position`, then creation time.
- A channel belongs to at most one category of the same server; deleting a category moves its channels to uncategorized.
- Members without `MANAGE_CHANNELS` only receive categories that contain at least one channel they can view.
- The sidebar shows uncategorized text and voice channels first, then each category with its channels; collapsed state persists per browser.
- Category changes are audited.

## Scope

- **In scope**: category model and CRUD endpoints, `categoryId` on channel create/update, grouped and collapsible sidebar, create-category dialog, category select in channel settings, create-channel-in-category shortcut.
- **Out of scope**: drag-and-drop reordering, category-level permission overrides and sync, realtime broadcast of channel structure changes (channels do not broadcast today either).

## Current Behavior

- `Channel` has no category (`schema.prisma`).
- `ChannelSidebar` renders two fixed groups, "Text channels" and "Voice channels" (`components/workspace/ChannelSidebar.tsx:152`).
- `GET /servers/:id` returns channels filtered by view permission with unread counts (`servers.service.ts:104`).

## Changes

### Rules

- Name: trimmed, 1–80 characters, stored as typed (not slugified).
- Create sets `position` to the current category count.
- `PATCH /categories/:id` accepts `name` and/or `position` (integer ≥ 0).
- `categoryId` on channel create/update must reference a category in the same server (`404 Category not found`); `null` on update removes the category.
- Audit: `CATEGORY_CREATE`, `CATEGORY_UPDATE`, `CATEGORY_DELETE` with `{ name, position }`.

### Sidebar

- `groupChannelsByCategory(channels, categories)` (pure) returns `{ uncategorizedText, uncategorizedVoice, categories: Array<{ category, channels }> }`, channels in their existing order.
- The two existing groups keep their titles and create buttons, so muscle memory still works.
- Category header: chevron toggle (`aria-expanded`), name, and "Create channel in <category>" button.
- Collapsed categories hide channels except the active one and channels with unread mentions.
- Channel search hides categories with no matching channels.
- Collapsed ids are stored in `localStorage` key `discord-clone-collapsed-categories`; a read failure falls back to all expanded.

## Technical Approach

### Data model

```prisma
model ChannelCategory {
  id        String    @id @default(cuid())
  serverId  String
  name      String
  position  Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  server    Server    @relation(fields: [serverId], references: [id], onDelete: Cascade)
  channels  Channel[]

  @@index([serverId, position])
}
```

`Channel.categoryId String?` with `onDelete: SetNull` and `@@index([categoryId])`. Migration `20260915005000_add_channel_categories`.

### API

| Method   | Path                            | Body                               | Response                  |
| -------- | ------------------------------- | ---------------------------------- | ------------------------- |
| `POST`   | `/servers/:serverId/categories` | `{ name }`                         | `201 { category }`        |
| `PATCH`  | `/categories/:categoryId`       | `{ name?, position? }`             | `{ category }`            |
| `DELETE` | `/categories/:categoryId`       | —                                  | `{ ok: true }`            |
| `POST`   | `/servers/:serverId/channels`   | adds `categoryId?`                 | `{ channel }`             |
| `PATCH`  | `/channels/:channelId`          | adds `categoryId?: string \| null` | `{ channel }`             |
| `GET`    | `/servers/:serverId`            | —                                  | `server.categories` added |

### Files

- API: `channels/categories.controller.ts`, `channels/categories.service.ts`, `channels/dto/create-category.dto.ts`, `update-category.dto.ts`, channel DTOs, `channels.service.ts`, `servers.service.ts`.
- Web: `api.ts`, `utils/channelCategories.ts`, `hooks/useCollapsedCategories.ts`, `components/workspace/ChannelSidebar.tsx`, `ChannelList.tsx` (`CategorySection`), `WorkspaceDialogs.tsx` (create-category dialog), `EditCategoryDialog.tsx` (rename, position, delete), `WorkspaceSidebar.tsx`, `hooks/useWorkspaceNavigation.ts` (`createCategory`, `updateCategory`, `deleteCategory`), `components/settings/ChannelSettings.tsx`, `hooks/useSettingsActions.ts`.
- The "Create category" menu item, empty categories, and per-category create buttons only render for members with `MANAGE_CHANNELS` (UI gating through `utils/serverPermissions.ts`; the API enforces).

## Trade-offs

- **Keeping the text/voice groups for uncategorized channels vs. one flat uncategorized list**: existing servers have no categories, so their sidebar stays unchanged after deploy. Cost: two grouping styles coexist until a server adopts categories.
- **Filtering categories server-side**: a private category name ("mod-only") would otherwise leak to every member.
- **No drag-and-drop**: needs a new dependency or significant custom pointer code; position editing is already exposed through settings for channels and can follow the same way.

## Risks & Rollback

- **Risk**: channels whose category belongs to another server cannot occur through the API, but the foreign key does not enforce same-server; the service validates on every write.
- **Rollback**: revert code; the migration is additive and `categoryId` is nullable.

## Test Plan

- **Manual**: create "Community" category → create a text channel inside it → move another channel in via settings → collapse and reload → still collapsed → delete category → channels return to the top groups.

## Deployment Notes

- Run migration `20260915005000_add_channel_categories` before deploying the API.
