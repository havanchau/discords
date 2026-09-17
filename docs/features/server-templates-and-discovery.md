# Feature Spec: Server Templates and Public Discovery

Two related but independent slices: **(A)** create a new server from a reusable template snapshot of roles, categories, channels, and permission overrides, and **(B)** an opt-in public discovery listing of servers, searchable by name/tags. They are documented together because discovery templates ("create a Gaming server") are a natural follow-on of slice A, but each ships independently — see Scope.

## Goal

**Slice A**: a member creates a new server pre-populated from a template's roles, categories, channels, and channel permission overrides, without copying any messages or members.

**Slice B**: a server owner opts their server into a public directory with a description and tags; any user (member or not) searches and browses that directory and joins from it.

Acceptance criteria:

- `POST /servers/from-template/:templateId` creates a server owned by the caller whose roles, categories, channels, and `ChannelPermissionOverride` rows mirror the template's snapshot, with the caller as owner (same owner/`@everyone`/first-channel bootstrap `createServer` already does).
- A template snapshot never contains a `Message`, `ServerMember`, or `Invite` row — copying a template creates a server with **zero** members other than the creator and zero messages, matching the "no messages or members" requirement explicitly.
- `PATCH /servers/:serverId/discovery` (owner/`MANAGE_SERVER`) sets `{ listed: boolean, description, tags }`; `GET /discovery/servers?query=&tag=` returns listed, non-deleted servers with member count, description, and tags, paginated, searchable by name/description substring and by tag.
- A listed server's discovery card shows a "Join" action that goes through the existing invite-join flow via a **discovery-scoped invite** (see Changes) rather than exposing direct join-without-invite, so banned users and rate limits still apply.
- Un-listing a server removes it from `GET /discovery/servers` immediately; it does not affect existing members or invites.
- Reporting a listed server (abuse) is available to any authenticated user and does not require membership.

## Scope

- **In scope (Slice A)**: `ServerTemplate` snapshot model (roles, categories, channels, channel permission overrides), a small built-in set of starter templates (e.g. "Gaming," "Study group" — content authored by the team, not user-submitted in v1), template creation from an existing server (owner exports their current structure as a template), server-from-template creation endpoint and UI entry point in the "Create server" dialog.
- **In scope (Slice B)**: `listed`/`description`/`tags` on `Server`, discovery search endpoint, discovery browse page, a discovery-scoped invite for joining, a report-server endpoint, basic abuse considerations (rate limits, minimum member count before eligible for listing, no automated moderation).
- **Out of scope**: user-submitted/community templates with a review queue, template versioning or updates propagating to servers already created from them, discovery ranking/algorithmic feature (v1 sorts by member count or recency only), discovery categories/verticals beyond free-text tags, server verification badges, automated content moderation of listed servers' descriptions, template marketplace monetization.

## Current Behavior

- `createServer` (`apps/api/src/modules/servers/servers.service.ts:32-78`) is the only server-creation path: it creates the `Server`, an `@everyone` role with `DEFAULT_MEMBER_PERMISSIONS`, the owner's `ServerMember`, a `general` `TEXT` channel — all in one `$transaction` — then returns `getServerForUser`. `CreateServerDto` (`apps/api/src/modules/servers/dto/create-server.dto.ts`) only accepts `name` and `description`; there is no template concept.
- `Server` has no `listed`, `tags`, or discovery-facing fields (`schema.prisma:170-189`); nothing in the schema or API distinguishes a public from a private server — every server today is only reachable by invite code (`joinInvite`, `servers.service.ts:309`).
- `Role`, `ChannelCategory`, `Channel`, and `ChannelPermissionOverride` are all scoped to one `serverId` (`schema.prisma:237,264,275,349`) with no export/snapshot representation; nothing in the codebase serializes a server's structure independent of its live rows.
- No search/browse endpoint exists anywhere in `apps/api/src/modules` outside message search (`messages.search.ts`), which is per-channel content search, not a server directory.

## Changes

### Slice A — Server Templates

#### Rules

- A `ServerTemplate` is a snapshot: `roles: Json` (array of `{ name, color, permissions, position }`), `categories: Json` (array of `{ name, position }`), `channels: Json` (array of `{ name, type, topic, categoryIndex, position, isPrivate, slowmodeSeconds }`, `categoryIndex` referencing the categories array by position rather than a live id, since ids do not exist yet at snapshot time), `overrides: Json` (array of `{ channelIndex, roleIndex | memberSelf: boolean, allow, deny }` — a template cannot reference a specific member, only "the creator," hence `memberSelf`).
- `POST /servers/:serverId/templates` (owner or `MANAGE_SERVER`) snapshots the server's **current** roles/categories/channels/overrides into a new `ServerTemplate` row scoped to that server (`sourceServerId`); it does not snapshot members, messages, invites, bans, or emoji.
- `POST /servers/from-template/:templateId` requires the template to be `isPublic: true` (built-in starter templates) or owned via `sourceServerId` by a server the caller can `MANAGE_SERVER` on (private template reuse); anything else is `404`. In one transaction: creates the `Server` (caller as owner), replays `roles` in order (so `position` and `@everyone`'s index-0 convention hold), replays `categories`, replays `channels` (resolving `categoryIndex` to the just-created category ids), replays `overrides` (resolving `channelIndex`/`roleIndex`, and `memberSelf` to the creator's own `ServerMember.id`), then assigns the owner to every created role that the template marks as an `@everyone`-equivalent (position 0) — mirroring the existing `createServer` bootstrap of owner + `@everyone`.
- If the template's `channels` array is empty, the same fallback `createServer` uses (`servers.service.ts:66-72`) still applies: guarantee at least one `TEXT` channel, per `RULE.md`'s "a server must have at least one text channel."
- Audit: `SERVER_TEMPLATE_CREATE` (on snapshot) and `SERVER_CREATE_FROM_TEMPLATE` `{ templateId }` (on use), following the existing action-string convention.

#### Client

- "Create server" dialog gains a template picker step (built-in templates, or "Start from scratch" which is the existing flow unchanged) before the existing name/description form.
- Server settings gains a "Save as template" action for `MANAGE_SERVER` holders, producing a private template usable from that same account's "Create server" dialog.

### Slice B — Public Discovery

#### Rules

- `listed`, `description` (reused from the existing `Server.description` column — no duplicate field), and `tags: String[]` (0-5 tags, each 1-20 characters) live on `Server`, editable via `PATCH /servers/:serverId/discovery` by `MANAGE_SERVER`.
- A server becomes listable only once it has at least 2 members (owner + 1) — a bare, empty server is not eligible, a minimal anti-spam floor rather than a full moderation system (see Trade-offs).
- `GET /discovery/servers?query=&tag=&cursor=` requires authentication (not anonymous) to reduce scraping/abuse surface, matching the rest of the API's existing auth-everywhere posture; returns `{ servers: DiscoveryServerCard[], nextCursor? }` sorted by member count descending as the v1 ranking (explicitly not an algorithmic feed).
- `DiscoveryServerCard`: `{ id, name, description, avatarUrl, tags, memberCount }` — never exposes channel names, member lists, or anything only a member should see; this is a strict subset of what `GET /servers/:id` returns to members.
- Joining from discovery: `POST /discovery/servers/:serverId/join` creates (or reuses) a long-lived, uncapped **discovery invite** the server always has exactly one of (auto-created the first time a server is listed, analogous to how `@everyone` is upserted on demand at `servers.service.ts:352-359`), then calls the existing `joinInvite` logic unchanged — so ban checks, the `@everyone` role grant, and audit stay identical to any other invite join. This avoids a second, parallel join code path that could drift from `joinInvite`'s ban/limit checks.
- `POST /discovery/servers/:serverId/report`: any authenticated user, `{ reason: string, details?: string }`, creates a `ServerReport` row; rate-limited per user (same rate-limit-decorator pattern already used across the API) to prevent report spam; does not auto-unlist — a human reviews reports (out of scope: the review tooling itself, flagged in Trade-offs).
- Un-listing (`listed: false`) is immediate and does not delete `tags`/`description` (an owner can re-list later without re-entering them).

#### Client

- New "Discover" entry point (e.g. a rail item, mirroring the "Add a server" affordance) opens a browse/search page: search box, tag filter chips, server cards with a "Join" button.
- Server settings gains a "Discovery" section: listed toggle, description (shared with the existing server description field, not a new textarea), tag editor, and (read-only) member-count-eligibility notice when below the 2-member floor.
- A "Report server" action is available from the discovery card's overflow menu, opening a reason form.

## Technical Approach

### Data model

```prisma
model ServerTemplate {
  id             String   @id @default(cuid())
  sourceServerId String?
  creatorId      String
  name           String
  isPublic       Boolean  @default(false)
  roles          Json
  categories     Json
  channels       Json
  overrides      Json
  createdAt      DateTime @default(now())
  sourceServer   Server?  @relation(fields: [sourceServerId], references: [id], onDelete: SetNull)
  creator        User     @relation(fields: [creatorId], references: [id])
}

model Server {
  // ...existing fields unchanged...
  listed      Boolean  @default(false)
  tags        String[] @default([])
  discoveryInviteId String?
  reports     ServerReport[]
}

model ServerReport {
  id          String   @id @default(cuid())
  serverId    String
  reporterId  String
  reason      String
  details     String?
  createdAt   DateTime @default(now())
  server      Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  reporter    User   @relation(fields: [reporterId], references: [id], onDelete: Cascade)

  @@index([serverId, createdAt])
}
```

Two migrations, one per slice, so either can ship without the other: `<timestamp>_add_server_templates` and `<timestamp>_add_server_discovery`.

### API

| Slice | Method  | Path                                  | Body                               | Response                                                                      |
| ----- | ------- | ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| A     | `POST`  | `/servers/:serverId/templates`        | `{ name, isPublic? }`              | `201 { template }`                                                            |
| A     | `GET`   | `/templates`                          | query: `mine?`                     | `{ templates: ServerTemplateSummary[] }` (built-in `isPublic` + caller's own) |
| A     | `POST`  | `/servers/from-template/:templateId`  | `{ name, description? }`           | `201 { server }` (same shape `createServer` returns)                          |
| B     | `PATCH` | `/servers/:serverId/discovery`        | `{ listed?, description?, tags? }` | `{ server }`                                                                  |
| B     | `GET`   | `/discovery/servers`                  | query: `query?, tag?, cursor?`     | `{ servers: DiscoveryServerCard[], nextCursor? }`                             |
| B     | `POST`  | `/discovery/servers/:serverId/join`   | —                                  | same shape `joinInvite` returns                                               |
| B     | `POST`  | `/discovery/servers/:serverId/report` | `{ reason, details? }`             | `201 { ok: true }`                                                            |

### Realtime

- Neither slice needs a new realtime event: template use produces an ordinary new server, discovered the same way any newly-joined server is today (client refetches `GET /servers` after the join call succeeds, same as any invite join); discovery browsing is a request/response search, not a live feed.

### Files

- API: `apps/api/prisma/schema.prisma`, two new migrations, new `apps/api/src/modules/servers/server-templates.service.ts`, new `apps/api/src/modules/servers/server-discovery.service.ts`, `servers.controller.ts` (new routes for both slices, or a new `discovery.controller.ts` for slice B given it has no `:serverId`-membership-gated routes today), `dto/create-template.dto.ts`, `dto/update-discovery.dto.ts`, `dto/report-server.dto.ts`, `servers.service.ts` (extract the role/channel/`@everyone` bootstrap steps from `createServer` into a shared private helper both `createServer` and `createFromTemplate` call, avoiding duplicating that transaction logic).
- Web: `apps/web/src/api.ts`, new `apps/web/src/components/servers/TemplatePicker.tsx`, `SaveAsTemplateDialog.tsx`, new `apps/web/src/components/discovery/DiscoveryPage.tsx`, `DiscoveryServerCard.tsx`, `ReportServerDialog.tsx`, `apps/web/src/components/settings/ServerDiscoverySettings.tsx`, `apps/web/src/i18n/locales/en.ts` / `vi.ts`.

## Trade-offs

| Option                                                                                                       | Pros                                                                                                                                                                                                                                                                           | Cons                                                                                                                                                                                                             | Verdict                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Json` snapshot columns for template content vs. real `TemplateRole`/`TemplateChannel` tables                | One migration, one row per template, matches the repo's existing precedent for structured-but-unqueried data (`AuditLog.metadata`, and this batch's own `selfAssignQuestions` in `server-onboarding.md`); a template is replayed once and never queried by its internal fields | Cannot validate references at the DB level (a malformed `categoryIndex` only fails at replay time, in application code); no partial-update of one role within a template without rewriting the whole `Json` blob | **Chosen** — templates are write-once, read-whole-and-replay artifacts; normalized tables would only pay off if templates needed field-level editing or querying, which this doc does not require                                                                                                 |
| Built-in-only templates (v1) vs. open user-submitted template marketplace                                    | Zero moderation surface for template content in v1; `isPublic` on `ServerTemplate` still leaves room to open submissions later without a schema change                                                                                                                         | Smaller initial value (fewer template choices)                                                                                                                                                                   | **Chosen**: ship built-in templates first; opening submissions is a straightforward follow-up once the model already distinguishes `isPublic`                                                                                                                                                     |
| Discovery join via an auto-created, always-on "discovery invite" vs. a parallel join-without-invite endpoint | Reuses `joinInvite`'s ban check, `@everyone` grant, and audit path exactly — no second place to keep those rules in sync, directly following `RULE.md`'s reuse-over-duplication principle                                                                                      | One extra `Invite` row per listed server that behaves slightly differently from a normal invite conceptually (never expires, never manually created) — needs a code comment explaining why it exists             | **Chosen** — the ban-check and audit-parity argument outweighs the minor conceptual awkwardness of an implicit invite row                                                                                                                                                                         |
| 2-member floor + manual reports for abuse vs. deferring discovery entirely until a moderation system exists  | Ships a usable v1 directory now                                                                                                                                                                                                                                                | Provides only a minimal abuse floor — no automated content scanning, no rate limit on how many servers one account can list, no admin review UI (all flagged as out of scope)                                    | **Chosen to ship a minimal version**, with the gaps written down rather than silently assumed solved — `open-questions.md` carries whether a moderation review UI is required before this can go to production, since `ServerReport` rows with no review surface today are a dead end without one |

## Risks & Rollback

- **Risk (Slice A)**: `createFromTemplate` replays multiple tables in one transaction for a template that could (in the built-in case) contain many roles/channels/overrides; a large template increases transaction duration — acceptable for the small built-in set in scope, but a user-submitted-template future (out of scope) would need a size cap.
- **Risk (Slice B)**: the auto-created discovery invite is a new kind of `Invite` row with no `maxUses`/`expiresAt` — if any existing invite-management UI (revoke list, invite count) does not expect an invite with no visible creator action, it needs to filter or label it explicitly; not auditing this UI further is a named gap, not a verified non-issue.
- **Risk (Slice B)**: `ServerReport` has no moderation review surface in this doc's scope — reports accumulate with no action path, which could become a compliance gap if this ships to real users; called out above as an open question rather than assumed acceptable.
- **Rollback**: revert code; both migrations are additive (new tables, new nullable/defaulted `Server` columns) and safe to drop independently.

## Test Plan

- **Automated**: none — `RULE.md` forbids `*.test.ts`/`*.spec.ts` files. Verify with `npm run typecheck`, `npm run lint`, `npm run build`.
- **Manual (Slice A)**: owner of server X saves it as a private template → creates a new server from that template → new server has the same role names/permissions, categories, and channels as X, zero members besides the creator, zero messages.
- **Manual (Slice B)**: owner lists server Y with tags `gaming`, `casual` → another user searches `gaming` in Discover → finds Y, sees member count and description but no channel list → joins → becomes a member via the existing invite-join path (ban check still applies if that user is banned from Y).
- **Failure case**: a server with only 1 member (owner-only) attempting to set `listed: true` is rejected (`400`, below the 2-member floor); a banned user attempting `POST /discovery/servers/:serverId/join` gets the same `403 You are banned from this server` `joinInvite` already returns.

## Deployment Notes

- Run both new migrations before deploying the API; they can deploy independently (Slice A does not depend on Slice B's columns or vice versa).
- New `template.*` and `discovery.*` i18n keys land in both `en` and `vi` catalogs in the same change.
- No breaking change to existing endpoints; all new routes are additive.
- Before enabling public discovery in production, confirm a moderation/report-review process exists outside this doc's scope — see `open-questions.md`.
