# Feature Spec: Server Events

Scheduled events inside a server that members can mark themselves interested in.

## Goal

Members with `MANAGE_SERVER` schedule events with a time and a channel or location; members browse upcoming events and toggle interest.

Acceptance criteria:

- Events have a name, optional description, start time, optional end time, and an optional channel of the same server or free-text location.
- `GET /servers/:serverId/events` returns scheduled and active events (not cancelled, not ended), soonest first, hiding events tied to channels the caller cannot view.
- Status is computed: `ACTIVE` once `startAt` has passed and the event has not ended (no `endAt`: active for 24 hours after start), otherwise `SCHEDULED`.
- Creating, editing, and cancelling require `MANAGE_SERVER` and are audited.
- Interest toggles per member and returns the updated count.
- Open clients refresh events through `server:events-updated`.

## Scope

- **In scope**: event and interest models, CRUD and interest endpoints, events dialog from the server menu, sidebar "Events" row with the upcoming count.
- **Out of scope**: reminders or notifications at start time (needs a scheduler), recurring events, cover images, external calendar export.

## Current Behavior

- No event concept exists. The server dropdown offers Server settings and Invite people (`components/workspace/ChannelSidebar.tsx:75`).
- The web client has no helper for the current user's server permissions; permission previews exist for roles in `utils/permissionPreview.ts`.

## Changes

### Rules

- `name` 1–100 characters after trimming (whitespace-only names return `400`); `description` up to 1000; `location` up to 200.
- `startAt` must be no earlier than 5 minutes ago and at most one year ahead; `endAt`, when set, must be after `startAt` and within 7 days of it.
- `channelId` must belong to the server (`404 Channel not found`).
- Edit accepts the same fields as optional; cancelled events cannot be edited (`400`).
- Cancel sets `cancelledAt`; cancelling twice is idempotent.
- Interest requires membership and, for channel events, view permission on the channel.
- Audit: `EVENT_CREATE`, `EVENT_UPDATE`, `EVENT_CANCEL` with `{ name, startAt }`.

### Client

- `memberHasServerPermission(server, userId, permission)` (pure) mirrors the server-level check (owner or any role) and only gates UI; the API still enforces.
- Server dropdown: "Events" opens `ServerEventsDialog`: list of event cards (date, status badge, name, channel or location, description, interested count, Interested toggle), "Create event" form for managers (name, start, end, channel select, location, description), and Cancel for managers; loading, empty, and error states.
- Channel sidebar shows an "Events" row with the count of upcoming events when there is at least one.

## Technical Approach

### Data model

```prisma
model ServerEvent {
  id          String    @id @default(cuid())
  serverId    String
  channelId   String?
  creatorId   String
  name        String
  description String?
  location    String?
  startAt     DateTime
  endAt       DateTime?
  cancelledAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  server      Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  channel     Channel? @relation(fields: [channelId], references: [id], onDelete: SetNull)
  creator     User     @relation("EventCreator", fields: [creatorId], references: [id])
  interests   ServerEventInterest[]

  @@index([serverId, startAt])
}

model ServerEventInterest {
  eventId   String
  userId    String
  createdAt DateTime @default(now())
  event     ServerEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([eventId, userId])
  @@index([userId])
}
```

Migration `20260915010000_add_server_events`.

### API

| Method | Path | Body | Response | Rate limit |
| --- | --- | --- | --- | --- |
| `GET` | `/servers/:serverId/events` | — | `{ events: ServerEventView[] }` (max 50) | default |
| `POST` | `/servers/:serverId/events` | `{ name, description?, location?, channelId?, startAt, endAt? }` | `201 { event }` | 20/min |
| `PATCH` | `/events/:eventId` | same fields, optional | `{ event }` | 20/min |
| `DELETE` | `/events/:eventId` | — | `{ ok: true }` | 20/min |
| `PUT` | `/events/:eventId/interest` | `{ interested: boolean }` | `{ interested, interestedCount }` | 60/min |

`ServerEventView`: `{ id, serverId, channelId, name, description, location, startAt, endAt, status, creator: { id, displayName, avatarUrl }, interestedCount, interested }`.

### Files

- API: `modules/events/events.module.ts`, `events.controller.ts`, `events.service.ts`, `event-status.ts`, `dto/create-event.dto.ts`, `update-event.dto.ts`, `set-interest.dto.ts`, `app.module.ts`.
- Web: `api.ts`, `utils/serverPermissions.ts` (added with [member-timeout-and-slowmode.md](member-timeout-and-slowmode.md)), `hooks/useServerEvents.ts`, `components/events/ServerEventsDialog.tsx`, `EventCard.tsx`, `EventForm.tsx`, `ServerEvents.module.css`, `components/WorkspaceSidebar.tsx` (dialog state), `components/workspace/ChannelSidebar.tsx` (menu item and "Events" row), `components/workspace/types.ts`, `AppShell.tsx`.

## Trade-offs

- **`MANAGE_SERVER` vs. a new `MANAGE_EVENTS` permission**: avoids a permission that existing roles would silently lack; can be split later.
- **Computed status vs. stored status with a scheduler**: no job infrastructure exists (`@nestjs/schedule` is not installed); computing from timestamps is always correct. Cost: no start-time notifications.
- **Separate dialog vs. a channel-like events page**: a dialog fits the existing settings/dialog pattern without a new routing concept.

## Risks & Rollback

- **Risk**: times are entered in the browser's local time zone and stored as UTC; viewers see them converted to their own zone.
- **Rollback**: revert code; the migration is additive.

## Test Plan

- **Manual**: owner creates an event in 10 minutes in a voice channel → member sees the sidebar row and dialog live → marks interested → count updates → owner cancels → it disappears.

## Deployment Notes

- Run migration `20260915010000_add_server_events` before deploying the API.
