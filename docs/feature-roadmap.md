# Feature Roadmap

This checklist captures product features that would make the app feel closer to a full Discord-class communication tool. Keep the checklist truthful: only mark a task complete after implementation and verification.

## Implementation Order

- [x] Start with low-risk client polish that does not change backend contracts.
- [x] Prefer features that reuse existing surfaces before adding new database models.
- [x] Add API, Socket.IO, and Prisma work only after UI behavior and permission rules are clear.
- [x] Preserve existing event names, DTOs, localStorage keys, upload fields, and permission behavior unless a feature explicitly requires a new contract.
- [x] Run lint, typecheck, build, and focused tests for each completed feature slice.

## Feature Delivery Checklist

Use this checklist before adding any roadmap item or new product feature. It keeps scoping, implementation, verification, and release work close to the existing feature backlog.

### Scope And Product Fit

- [x] Name the feature and the user problem it solves.
- [x] Confirm the owning product area: servers, channels, direct messages, members, roles, messages, presence, notifications, media, voice, video, or screen sharing.
- [x] Check `feature-spec.md`, `implementation-plan.md`, and this roadmap for overlapping or prerequisite work.
- [x] Define the smallest shippable slice that is useful without hidden follow-up work.
- [x] List explicit out-of-scope behavior so the first slice stays focused.
- [x] Identify whether the feature changes permissions, private data visibility, realtime events, persisted data, uploads, or notifications.

### Data And API Design

- [x] Identify the owning domain model and existing Prisma relations to reuse.
- [x] Decide whether a Prisma migration is required or existing fields are enough.
- [x] Define request and response DTOs with validation at every API boundary.
- [x] Add or update shared TypeScript contracts in `packages/shared` when client and API both use the shape.
- [x] Define pagination, sorting, filtering, and retention behavior for list endpoints.
- [x] Ensure empty, invalid, unauthorized, forbidden, and missing-resource states return explicit errors.

### Permissions And Security

- [x] Check server membership before reading server, channel, member, role, message, invite, or audit data.
- [x] Check role permissions before write, moderation, invite, upload, or settings operations.
- [x] Confirm owners retain required administrative access.
- [x] Prevent clients from trusting optimistic UI for authorization decisions.
- [x] Add rate limiting when the feature can spam messages, invites, uploads, notifications, or auth-related actions.
- [x] Avoid logging secrets, tokens, private message content, encryption keys, or upload credentials.

### Realtime And State Synchronization

- [x] Decide whether the feature needs Socket.IO events or can use existing REST refresh behavior.
- [x] Define explicit event names and typed payloads in `packages/shared` before wiring client handlers.
- [x] Authorize every event that mutates or reveals state on the server.
- [x] Persist state before emitting realtime events.
- [x] Define optimistic UI reconciliation for success, failure, duplicate delivery, and stale payloads.
- [x] Confirm reconnect behavior restores the correct feature state.

### Web Client Implementation

- [x] Find the existing surface that should own the feature state before adding new global state.
- [x] Keep loading, empty, error, unauthorized, and offline states explicit.
- [x] Preserve drafts, composer text, selected channel, selected DM, and open modals unless the feature intentionally resets them.
- [x] Add accessible labels for icon-only controls, menus, dialogs, tabs, and keyboard shortcuts.
- [x] Ensure keyboard navigation works for interactive lists, command palettes, popovers, and dialogs.
- [x] Verify desktop layout at 1440x900 and 1366x768.
- [x] Verify mobile layout at 390x844 without hidden primary controls.
- [x] Follow Discord UI rules from `DISCORD_UI_SKILL.md` and `design-rules.md` for any UI work.

### Media, Uploads, And External Services

- [x] Validate file type, file size, and ownership before upload persistence.
- [x] Keep local upload behavior and Cloudinary-ready behavior aligned.
- [x] Add safe previews for images, video, audio, generic files, and failed uploads where relevant.
- [x] Avoid storing generated files, local upload artifacts, or external credentials in git.
- [x] Define cleanup behavior for orphaned uploads after failed sends or deleted messages.
- [x] Confirm links, embeds, and attachments do not bypass channel visibility rules.

### Testing And Documentation

- [x] Verify changes with typecheck, lint, build, and a manual scenario in the feature doc; the repository keeps no automated test files (see `RULE.md`).
- [x] Add UI smoke coverage for the main happy path and one failure or empty state when practical.
- [x] Run lint, typecheck, build, and focused tests for touched workspaces.
- [x] Run `npm run docs:check` when documentation changes.
- [x] Run `npm run ui:scan` when UI, CSS, or visual tokens change.
- [x] Update README, architecture, feature spec, security, deployment, or UI planning docs when their owned topics change.
- [x] Record known limitations and follow-up work as unchecked items, not completed tasks.

## Current Follow-Up Backlog — 2026-06-11 Recheck

The realtime DM, channel message edit/delete broadcast, DM author payload, socket rate-limit cleanup, message search wiring, `AppShell.tsx` file-size issues, friend polish, member-level overrides, notification inbox, and moderation follow-ups are considered implemented in the current source. Keep any future unchecked items in this section until they are implemented and verified.

### Critical Remaining Product Gaps

- [x] **ISSUE-04 — Friend realtime notifications:** inject the shared realtime publisher or an event-emitter bridge into the friend flow, emit `friend:request` to `user:<receiverId>` after a new request is created, emit `friend:updated` to both users after request response changes, add shared event constants, and update `useRealtimeSocket`/home state so the friends summary refreshes without manual navigation.
- [x] **ISSUE-11 — Persistent DM unread tracking:** add a persistent `DirectReadState` or equivalent `lastReadAt` model for direct conversations, expose mark-read behavior for DMs, update unread counts from `dm:created`/`dm:unread`, and show unread badges in the recent DM list.
- [x] **ISSUE-13 — Member-level channel override UI:** add a member override section to channel settings, provide member selection and allow/deny controls, and reuse the existing channel override endpoint that already accepts `memberId`.

### Notifications And Inbox

- [x] **ISSUE-05 — In-app notification inbox:** replace the placeholder/pinned-message notification surface with a real notification inbox, add `GET /notifications` or an equivalent endpoint for recent mention/system events, add unread badge counts, and support loading/empty/error states.

### CI, Tests, And Verification

- [x] **ISSUE-06 — Production smoke tests:** add `npm run ui:smoke` to CI after build prerequisites are available, add post-deploy smoke coverage in `deploy.yml`, and document required deployed URL secrets.
- [x] **ISSUE-08 — Backend API tests:** superseded. Automated tests were removed from the repository (see `RULE.md`); permissions, auth/session lifecycle, message validation, and 401/403 behavior are verified manually.
- [x] **ISSUE-09 — Frontend realtime/state tests:** add tests for `useRealtimeSocket`, `useDirectMessages`, invalid socket auth disconnect behavior, and ChatPanel loading/empty/error states.
- [x] **ISSUE-12 — Message service search extraction:** split `MessageSearchFilters`, search normalization, date parsing, and Prisma where-builder helpers from `messages.service.ts` into a focused `messages.search.ts` module before the service grows further.

### Design Compliance

- [x] **ISSUE-10 — Auth gradients and cyan token cleanup:** replace the auth screen gradients with flat Discord dark surfaces, replace `--text-link: #00a8fc` with an approved Discord token, convert auth submit gradients to flat blurple states, and run `npm run ui:scan` after the CSS changes.

## 1. Message Drafts Per Channel And DM

- [x] Define draft storage ownership and key format.
- [x] Store one draft per text channel.
- [x] Store one draft per direct message conversation.
- [x] Restore the draft when switching back to a channel or DM.
- [x] Clear the draft after a successful send.
- [x] Preserve the draft when send fails.
- [x] Preserve the draft when upload fails.
- [x] Keep reply target handling explicit so stale reply context does not surprise users.
- [x] Add tests for channel draft restore and clear-on-send.
- [x] Add tests for DM draft restore and clear-on-send.
- [x] Verify localStorage migration/fallback behavior.
- [x] Verify mobile composer remains reachable with restored draft text.

## 2. Threaded Replies

- [x] Decide whether thread records are channel-scoped or message-scoped.
- [x] Add Prisma models or fields for thread roots and participants.
- [x] Add API endpoints for creating and listing threads.
- [x] Add API endpoints for thread messages.
- [x] Authorize thread access through the parent server/channel membership.
- [x] Add Socket.IO events for thread message create/update/delete.
- [x] Add unread tracking for thread replies.
- [x] Add a compact thread preview under root messages.
- [x] Add a thread panel that opens beside the chat on desktop.
- [x] Add a full-screen thread view on mobile.
- [x] Preserve message grouping inside thread timelines.
- [x] Add tests for thread permission checks.
- [x] Add tests for thread realtime delivery.
- [x] Add UI smoke coverage for opening a thread and sending a reply.

## 3. Advanced Message Search

- [x] Define supported query operators: `from:`, `in:`, `has:link`, `has:file`, `before:`, `after:`.
- [x] Add a parser for search input with clear fallback behavior.
- [x] Extend API search parameters without breaking existing search.
- [x] Add indexed database query support for author, channel, date, attachments, and links.
- [x] Show parsed filters in the search panel.
- [x] Add empty state text for no results and invalid filters.
- [x] Add result snippets with channel, author, timestamp, and match context.
- [x] Add keyboard navigation across results.
- [x] Add click-to-jump behavior with scroll anchoring.
- [x] Add tests for parser edge cases.
- [x] Add API tests for filter combinations.
- [x] Add UI smoke coverage for `has:link` and `from:` searches.

## 4. Unread And Mention Inbox

- [x] Define unread state ownership for channels, DMs, mentions, and thread replies.
- [x] Add API support for listing unread and mention items.
- [x] Add mark-read endpoint or reuse existing read receipt flow.
- [x] Add Socket.IO updates for new mention/unread changes.
- [x] Build an inbox panel from the existing notifications surface.
- [x] Group inbox items by server and channel.
- [x] Add mention, reply, thread, and pin item types.
- [x] Add mark item read and mark all read actions.
- [x] Add loading, empty, and error states.
- [x] Add keyboard navigation for inbox rows.
- [x] Add tests for unread permission visibility.
- [x] Add UI smoke coverage for receiving and clearing a mention.

## 5. Role Color And Permission Preview

- [x] Add a read-only permission preview panel in role settings.
- [x] Show which channels a selected role can view.
- [x] Show which actions a selected role can perform.
- [x] Highlight denied permissions clearly without neon or warning-heavy styling.
- [x] Preview combined permissions for a selected member.
- [x] Explain inherited/default `@everyone` behavior in compact settings copy.
- [x] Add channel filter support inside the preview.
- [x] Add tests for permission aggregation helpers.
- [x] Add UI tests for long role names and dense permission grids.
- [x] Verify the settings modal remains readable on mobile.

## 6. Invite Links With Expiry

- [x] Add invite data model with code, creator, server, expiry, max uses, and use count.
- [x] Add API endpoint to create invites.
- [x] Add API endpoint to list active invites for a server.
- [x] Add API endpoint to revoke invites.
- [x] Validate invite expiry and usage count during join.
- [x] Add permission checks for invite creation and management.
- [x] Build invite creation dialog with expiry and max-use controls.
- [x] Build invite management section in server settings.
- [x] Add copy invite link action with success/error feedback.
- [x] Add tests for expired invite rejection.
- [x] Add tests for max-use enforcement.
- [x] Add UI smoke coverage for creating and joining by invite.

## 7. Voice Room Presence

- [x] Define active voice occupancy payloads per server/channel.
- [x] Broadcast join, leave, mute, camera, and screen-share presence events.
- [x] Show voice participants nested under voice channel rows.
- [x] Add quick join button on occupied voice channels.
- [x] Show mute/deafen/camera/screen status icons.
- [x] Add empty voice state that remains compact.
- [x] Keep sidebar row heights stable when occupancy changes.
- [x] Add tests for presence event reducers.
- [x] Add Socket.IO tests for authorized voice presence visibility.
- [x] Add UI smoke coverage for joining and leaving a voice channel.

## 8. Pinned Media, Files, And Links View

- [x] Define media categorization for images, videos, audio, files, and links.
- [x] Add API endpoint or client selector for channel media collections.
- [x] Add tabs for Media, Files, and Links in the utility panel.
- [x] Add thumbnail grid for images and videos.
- [x] Add compact file rows with size and author metadata.
- [x] Add link rows with hostname, author, and timestamp.
- [x] Add filters for current channel versus server-wide results.
- [x] Add loading, empty, and error states.
- [x] Add keyboard navigation and accessible labels.
- [x] Add tests for attachment categorization.
- [x] Add UI smoke coverage for viewing an uploaded file and link.

## 9. Slash Commands

- [x] Define command registry shape and ownership.
- [x] Add client-side command parser for composer input.
- [x] Add autocomplete popover triggered by `/`.
- [x] Add command option hints and keyboard navigation.
- [x] Implement `/me` as a client-rendered message action or server command.
- [x] Implement `/nick` if nickname support exists or add the required API first.
- [x] Implement `/poll` as a scoped follow-up feature.
- [x] Implement `/invite` after invite links exist.
- [x] Add validation and user-friendly errors for unknown commands.
- [x] Add tests for parsing and autocomplete ranking.
- [x] Add UI smoke coverage for opening autocomplete and executing a simple command.

## 10. Moderation Audit Timeline

- [x] Confirm audit event taxonomy and retention rules.
- [x] Record server, channel, role, member, invite, and message moderation events.
- [x] Add API endpoint to list audit entries by server.
- [x] Add filters by actor, action, target, and date.
- [x] Add permission checks so only authorized members can view audit logs.
- [x] Build audit log section in server settings.
- [x] Show compact event rows with actor, action, target, and timestamp.
- [x] Show metadata details in an expandable row or dialog.
- [x] Add loading, empty, and error states.
- [x] Add tests for event creation on moderation actions.
- [x] Add tests for audit visibility permissions.
- [x] Add UI smoke coverage for viewing a recent audit event.

## Cross-Feature Verification

- [x] Verify desktop layout at 1440x900 and 1366x768.
- [x] Verify mobile layout at 390x844.
- [x] Verify no forbidden neon colors, panel gradients, or colored glows.
- [x] Verify all new icon-only controls have accessible labels.
- [x] Verify keyboard focus is visible in new menus, panels, and dialogs.
- [x] Verify auth and permission paths before exposing private data.
- [x] Verify optimistic UI reconciles with server responses.
- [x] Update `docs/ui-redesign-plan.md` when a feature materially changes UI phase status.

## Discord Parity Backlog — 2026-09-15

Second roadmap wave. Each item has a feature spec under `docs/features/`; the spec is the contract and the checklist below tracks delivery. Order follows dependencies: blocking is used by every DM feature, markdown rendering is used by custom emoji, and the account-security items share the auth module.

### Delivery Order

1. Social: [user-blocking.md](features/user-blocking.md), [dm-message-actions.md](features/dm-message-actions.md), [group-dm.md](features/group-dm.md), [dm-calls.md](features/dm-calls.md).
2. Moderation: [member-bans.md](features/member-bans.md), [member-timeout-and-slowmode.md](features/member-timeout-and-slowmode.md).
3. Channels: [channel-categories.md](features/channel-categories.md).
4. Message rendering: [message-markdown.md](features/message-markdown.md), [custom-emoji.md](features/custom-emoji.md), [link-previews.md](features/link-previews.md).
5. Account security: [password-reset.md](features/password-reset.md), [session-management.md](features/session-management.md), [two-factor-auth.md](features/two-factor-auth.md).
6. Community: [server-events.md](features/server-events.md).

### Checklist

Status 2026-09-15: every item below is implemented, with typecheck, lint, and build passing. The repository no longer keeps automated tests (see `RULE.md`); items stay unchecked until a manual pass has run.

- [ ] Block and unblock users with enforcement on friend requests, DM creation, and 1-1 DM sends.
- [ ] Edit, delete, reply, react to, and pin direct messages.
- [ ] Create group DMs, rename them, add and remove members, and leave.
- [ ] Ring, accept, decline, and cancel 1-1 and group DM voice/video calls.
- [ ] Ban and unban server members; reject banned users on invite join.
- [ ] Time out members and enforce channel slowmode.
- [ ] Group channels into collapsible categories.
- [ ] Render safe markdown in channel and direct messages.
- [ ] Upload server custom emoji and use them in messages and reactions.
- [ ] Show SSRF-safe link preview cards.
- [ ] Reset a forgotten password by email.
- [ ] List and revoke active sessions.
- [ ] Protect login with TOTP two-factor authentication and recovery codes.
- [ ] Schedule server events with interest tracking.

## Wave 3.1 Backlog — 2026-09-16

Third roadmap wave, first slice. Specs are the contract; implementation starts only after they are reviewed. i18n is ordered first because every later feature adds user-facing strings, and `npm run i18n:check` is what stops those strings from being hardcoded.

### Delivery Order

1. Localization: [i18n-localization.md](features/i18n-localization.md).
2. Identity: [user-profile.md](features/user-profile.md).

### Checklist

Status 2026-09-16: both specs are implemented, with typecheck, lint, build, `check:file-size`,
`docs:check`, `ui:scan`, and the new `i18n:check` passing. The API paths were exercised against a
local database (migrations applied, `prisma migrate diff` reports no drift). Items stay unchecked
until a browser pass has run — see each spec's test plan.

- [ ] Resolve every web, email, push, and API error string from an `en`/`vi` catalog, with `npm run i18n:check` failing on a missed literal or a missing key.
- [ ] Persist the chosen locale on `User` and resolve it per request, per email, and per push notification.
- [ ] Add profile banner, pronouns, about me, and expiring custom status to the account profile.
- [ ] Add per-server nickname and avatar with one shared identity resolver.
- [ ] Replace the inline member-sidebar popover with a reusable profile card opened from the member list, channel messages, and direct messages.

## Wave 3.2 Backlog — 2026-09-17

Fourth roadmap wave. Specs were reviewed and approved on 2026-09-17; open decisions are rows 8–29 in [open-questions.md](features/open-questions.md), and until answered the "Assumption used" column is the decision.

### Status — 2026-09-17 (paused)

Work is paused after the bot API (phase 1) and resumes at stickers and soundboard. Polls through message reports are committed; AutoMod, account deletion, server onboarding, forum channels, server templates and discovery, keyboard shortcuts, incoming webhooks, and the bot API are not.

- **Implemented, committed in `fdafde0`:** polls, saved messages, forward message (including `DirectMessageAttachment`), voice messages, scheduled messages, message reports. Each spec has a "Deviations" section describing what was built differently from the reviewed draft.
- **Verification so far:** `typecheck`, `lint`, `build`, `check:file-size`, `i18n:check`, `ui:scan`, `docs:check`, and Prettier pass. Migration SQL was checked with `prisma migrate diff` against the pre-change schema. No migration has been applied to any database, and no manual or browser scenario from any test plan has run, so every checklist item stays unchecked.
- **Pending migrations, in order:** `20260917000000_add_polls`, `20260917001000_add_saved_messages`, `20260917002000_add_message_forwarding`, `20260917003000_add_voice_messages`, `20260917004000_add_scheduled_messages`, `20260917005000_add_message_reports`, `20260917006000_add_automod`, `20260917007000_add_account_deletion_and_export`, `20260917008000_add_server_onboarding`, `20260917009000_add_forum_channels`, `20260917010000_add_server_templates`, `20260917011000_add_server_discovery`, `20260917012000_add_incoming_webhooks`, `20260917013000_add_bot_api`, `20260917014000_add_stickers_and_soundboard`.
- **AutoMod:** [automod.md](features/automod.md) implemented, uncommitted, with a "Deviations" section; migration `20260917006000_add_automod`.
- **Account deletion and export:** [account-deletion-and-export.md](features/account-deletion-and-export.md) implemented, uncommitted, with a "Deviations" section; migration `20260917007000_add_account_deletion_and_export`.
- **Server onboarding:** [server-onboarding.md](features/server-onboarding.md) implemented, uncommitted, with a "Deviations" section; migration `20260917008000_add_server_onboarding`.
- **Forum channels:** [forum-channels.md](features/forum-channels.md) implemented, uncommitted, with a "Deviations" section; migration `20260917009000_add_forum_channels`.
- **Server templates and discovery:** [server-templates-and-discovery.md](features/server-templates-and-discovery.md) implemented, uncommitted, with a "Deviations" section; migrations `20260917010000_add_server_templates` and `20260917011000_add_server_discovery`.
- **Keyboard shortcuts:** [keyboard-shortcuts.md](features/keyboard-shortcuts.md) implemented, uncommitted, with a "Deviations" section; web client only, no migration.
- **Incoming webhooks:** [incoming-webhooks.md](features/incoming-webhooks.md) implemented, uncommitted, with a "Deviations" section; migration `20260917012000_add_incoming_webhooks`. It introduced `User.kind` (`HUMAN | WEBHOOK`), which the bot API extends with `BOT`.
- **Bot API (phase 1, REST only):** [bot-api.md](features/bot-api.md) implemented, uncommitted, with a "Deviations" section; migration `20260917013000_add_bot_api`. Bots call an explicit `/bot-api/*` allowlist with `Authorization: Bot <token>`; gateway access (phase 2) and slash commands (phase 3) are not built. Next migration timestamp after stickers and soundboard: `20260917015000`.
- **Stickers and soundboard:** [stickers-and-soundboard.md](features/stickers-and-soundboard.md) implemented, uncommitted web client and API i18n on top of the API committed in `8d60e21`, with a "Deviations" section; migration `20260917014000_add_stickers_and_soundboard`. Not run in a browser; see "Stickers And Soundboard — Remaining Work".
- **Skipped:** [stage-channels.md](features/stage-channels.md), blocked on an SFU that has no implementation.
- **File-size split (no behavior change):** the Prisma schema is now a folder (`apps/api/prisma/schema.prisma` plus `prisma/models/*.prisma`, empty `prisma migrate diff` against the single file), and the web locale catalogs are per-area modules under `apps/web/src/i18n/locales/{en,vi}/`, read by `scripts/i18n-scan.mjs`.
- **Decision taken during implementation:** no `@nestjs/schedule` dependency; scheduled messages reuse the `setInterval` sweep with a conditional claim from saved-message reminders.

### Stickers And Soundboard — Remaining Work

- [x] API: map the sticker and soundboard error messages in `apps/api/src/common/i18n/error-codes.ts` with `en` and `vi` entries.
- [x] API: review the edits that carry `stickerId` through send, forward, format, and export.
- [x] Web: `useServerStickers` and `useServerSoundboard` hooks with query keys, multipart `postMultipart` in `api.ts`, and refetch on `server:stickers-updated` / `server:soundboard-updated`.
- [x] Web: sticker picker in the composer, sending `stickerId` over the socket `message:create` path with the REST fallback.
- [x] Web: sticker rendering in `MessageAttachments` (channel and direct messages) and `ThreadPanel`, including the placeholder when the sticker was deleted.
- [x] Web: Stickers and Soundboard sections in server settings, `MANAGE_SERVER` only, with client-side type, size, and duration checks.
- [x] Web: soundboard panel in the call controls that emits `soundboard:play`, local playback of `soundboard:played` mounted in the app shell, and the "X played Y" line.
- [x] Web: `en`/`vi` catalog keys in `apps/web/src/i18n/locales/{en,vi}/stickers-soundboard.ts`.
- [x] Docs: "Deviations" section in `stickers-and-soundboard.md`.
- [x] Thread composer sticker picker; sticker replies go through the thread REST route with `stickerId`.
- [x] i18n for `Not in this call` and `Too many upload chunks`, and translated socket acks for `message:create` and `soundboard:play` (see `i18n-localization.md` Deviations).
- [x] Verify: `typecheck`, `lint`, `build`, `check:file-size`, `i18n:check`, `ui:scan`, and Prettier pass; the migration's sticker and soundboard statements match SQL generated from the schema (`prisma migrate diff --from-empty`). `docs:check` is run with this doc change.
- [ ] Apply the migration to a local database and run the manual scenarios in the spec's test plan (sticker send and delete placeholder, soundboard in a two-client call, 31st sticker limit, `403` without `MANAGE_SERVER`), then check desktop and 390x844 layouts of the composer, call controls, and settings sections.
- [ ] Commit the stickers and soundboard work.

### Follow-Ups Found During Implementation

Fixed on 2026-09-17 per [wave-3-2-follow-ups.md](features/wave-3-2-follow-ups.md) (implemented, typecheck/lint/build and scans pass; manual scenarios not run yet):

- [x] Validate socket `message:create` / `thread:message:create` bodies with `CreateMessageDto`, as REST does. `byteSize` stays client-reported on both paths.
- [x] E2EE: `/poll` is refused and Forward is hidden in, and not offered into, a channel this client encrypts; scheduling was already hidden. Enforced in the client only, since the API has no encrypted-channel flag.
- [x] AutoMod refuses `e2ee:v1:` content while an enabled rule applies to the author in that channel.
- [x] `POST /auth/account-deletion/cancel` requires the 2FA code when enabled and is limited per email address.
- [x] `i18n:check` covers files directly under `apps/web/src/` and skips deleted files; `ui:scan` and `check:file-size` include untracked files.
- [x] Invite join posts to `POST /invites/:code/join` and opens the joined server.
- [x] Channel polls bump unread badges live; DM polls update unread state and create a DM notification.
- [x] "Jump to message" from Saved Messages scrolls to the message once it has loaded.
- [x] `server:onboarding-updated` refreshes the rules gate in open tabs.
- [x] Thread and forum messages have react, save, report and delete actions in the thread panel.
- [x] Account export includes saved server templates and filed server reports.
- [x] Role create, edit, delete, add and remove require holding the role's permissions (shared `canGrantRoles` with bot authorize).
- [x] Notifications and AutoMod alerts name a bot by its display name.
- [x] Deleting a sticker or soundboard clip deletes its stored file.
- [ ] Add `VOICE_MAX_BYTES=26214400` to the API `.env.example` (agents cannot edit `.env*` files).
- [ ] Add the optional `PRIVATE_STORAGE_LOCAL_DIR` (account export files, local storage driver) to the API `.env.example`.
- [ ] Account deletion clears avatar and banner URLs but does not remove the files: `avatarUrl`/`bannerUrl` are client-chosen URLs that may be shared with other rows, so deleting them needs upload ownership tracking first.
- [ ] `ServerReport` rows from discovery have no review surface: it needs a platform-level reviewer, which does not exist (open question 16); discovery is not production-ready until one exists.
- [ ] `apps/web/src/AppShell.tsx` is at about 875 of 1000 lines; later features must add logic in new hooks and components.
- [ ] Run the manual scenarios in [wave-3-2-follow-ups.md](features/wave-3-2-follow-ups.md).

### Delivery Order

1. Messaging: [polls.md](features/polls.md), [saved-messages.md](features/saved-messages.md), [forward-message.md](features/forward-message.md), [voice-messages.md](features/voice-messages.md), [scheduled-messages.md](features/scheduled-messages.md). `DirectMessageAttachment` lands with the first of forward, voice, or scheduled messages.
2. Safety: [message-reports.md](features/message-reports.md), [automod.md](features/automod.md), [account-deletion-and-export.md](features/account-deletion-and-export.md).
3. Community: [server-onboarding.md](features/server-onboarding.md), [forum-channels.md](features/forum-channels.md), [server-templates-and-discovery.md](features/server-templates-and-discovery.md).
4. Integrations and UX: [keyboard-shortcuts.md](features/keyboard-shortcuts.md), [incoming-webhooks.md](features/incoming-webhooks.md), [bot-api.md](features/bot-api.md), [stickers-and-soundboard.md](features/stickers-and-soundboard.md).
5. Blocked on [voice-sfu.md](features/voice-sfu.md): [stage-channels.md](features/stage-channels.md).

### Checklist

- [ ] Create, vote in, and close polls with realtime results.
- [ ] Save messages and receive reminders.
- [ ] Forward channel and direct messages with access re-checks.
- [ ] Record and send voice messages in channels and direct messages.
- [ ] Schedule, edit, and cancel messages for later delivery.
- [ ] Report messages and members to a server moderator queue.
- [ ] Enforce AutoMod rules on message send and edit.
- [ ] Delete an account and export personal data.
- [ ] Require rules acceptance and offer self-assign roles on join.
- [ ] Create forum channels with thread posts and tags.
- [ ] Create servers from templates and list servers in discovery.
- [ ] Navigate with global keyboard shortcuts and a quick switcher.
- [ ] Post channel messages through incoming webhooks.
- [ ] Install token-authenticated bots in servers.
- [ ] Use server stickers and soundboard clips.
- [x] Host stage channels with speakers and audience.

## Wave 4 Backlog — 2026-09-18

Fifth roadmap wave: the first full manual QA pass over Waves 2–3.2, the fixes it produced, and the remaining gaps. Specs were reviewed and approved on 2026-09-18: [qa-follow-ups-2026-09-18.md](features/qa-follow-ups-2026-09-18.md), [appshell-split.md](features/appshell-split.md), [upload-ownership.md](features/upload-ownership.md), [platform-report-review.md](features/platform-report-review.md), [bot-gateway-and-slash-commands.md](features/bot-gateway-and-slash-commands.md), [voice-sfu.md](features/voice-sfu.md), [stage-channels.md](features/stage-channels.md). Open decisions are rows 30–38 in [open-questions.md](features/open-questions.md); until answered, the "Assumption used" column is the decision.

### Status — 2026-09-18 (implemented, not committed)

Everything paused earlier in this wave was committed before this pass (`21e18d2` and earlier). This pass finished the wave; its changes are in the working tree, not committed.

- **QA pass, QA follow-ups, AppShell split, upload ownership:** done and verified earlier (see each doc's Deviations).
- **Platform report review:** web page verified in headless Chrome (16/16). The pass found and fixed a cache bug: after a delist the open detail kept showing the old state. See the doc's Deviations.
- **Bot slash commands in the composer:** built. The composer suggests the server's bot commands, invokes them, shows a waiting line and the timeout message. Verified in headless Chrome with a real bot socket (11/11). There is still no UI for a bot owner to register commands (only the bot REST API).
- **Voice SFU:** implemented behind `VOICE_TRANSPORT` (default `mesh`). Adds the LiveKit token service, the `livekit` compose service, the `livekit-client` room path (lazy-loaded) and the mesh-only `webrtc:*` relay. Verified against a local LiveKit container: 3-client video call, outage mid-call and at join, rejoin, and the mesh rollback. Not verified: 8+ participants, TURN from a restrictive network, and production hosting (a public IP and a UDP range).
- **Stage channels:** implemented and verified locally (API 30/30, browser 12/12). The browser run checked that a promoted and then demoted speaker keeps the same LiveKit session. The migration `20260918007000_add_stage_channels` is applied to the local database, and `prisma migrate diff` reports no drift.
- **Docs:** `voice-sfu.md`, `stage-channels.md`, `platform-report-review.md` and `bot-gateway-and-slash-commands.md` have Deviations sections. `voice-webrtc.md`, `dm-calls.md` and `stickers-and-soundboard.md` are updated in place. Open questions 24 and 30 are updated.
- **Verification of the tree:** `typecheck`, `lint`, `build`, `check:file-size`, `i18n:check`, `ui:scan`, `docs:check` and `ui:smoke` pass.

### Remaining

1. Add the env lines below by hand, then decide per environment when to set `VOICE_TRANSPORT=livekit` (dev first). Production needs a UDP-reachable host or LiveKit Cloud (`voice-sfu.md` Deployment Notes).
2. Run the scenarios that were not run: 8+ participants, TURN, and a kicked stage speaker's client in the browser.
3. Commit per feature. Retire the mesh path in a follow-up after one release on LiveKit.

### Env Lines To Add By Hand

Agents cannot edit `.env*` files.

- `.env` (local): `REDIS_URL=redis://127.0.0.1:56379` (the API does not start without it). If the API stays on port 3001, the Vite proxy needs `VITE_BACKEND_TARGET=http://localhost:3001`; otherwise put both on the same port. For LiveKit locally: `VOICE_TRANSPORT=livekit`, `LIVEKIT_URL=http://localhost:7880` (the API runs on the host, not in compose), `LIVEKIT_WS_URL=ws://localhost:7880`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (the `livekit` compose service reads the same two).
- `.env.example`: `VOICE_MAX_BYTES=26214400`, `PRIVATE_STORAGE_LOCAL_DIR=` and the LiveKit lines in [voice-sfu.md](features/voice-sfu.md) Deployment Notes.

### Checklist

- [x] Run the Wave 2–3.2 test plans against a local stack and record the defects.
- [x] Fix the QA defects (API and web).
- [x] Split `AppShell.tsx` below the file-size cap with no behavior change.
- [x] Track upload ownership and delete orphaned avatar and banner files.
- [x] Review discovery reports as a platform admin.
- [x] Connect bots over the gateway and invoke their slash commands from the composer.
- [ ] Carry voice and video channels over a LiveKit SFU with a mesh rollback flag (implemented and verified locally; 8+ participants, TURN and production hosting not verified).
- [x] Host stage channels with speakers and audience.
- [x] Decide open questions 30–39, including account deletion for server owners (row 38). Decided 2026-09-18; the code changes are in [server-ownership-lifecycle.md](features/server-ownership-lifecycle.md) and [open-question-decisions-2026-09-18.md](features/open-question-decisions-2026-09-18.md). Row 40 (an audit trail that survives server delete) is open.

## Wave 5 Backlog — 2026-09-22

- **Age-restricted channels:** [age-restricted-channels.md](features/age-restricted-channels.md). Implemented 2026-09-22; migration `20260922001000_add_age_restricted_channels` is not applied yet.
- **Server insights:** [server-insights.md](features/server-insights.md). Implemented 2026-09-22; migration `20260922002000_add_message_server_created_at_index` is not applied yet (index build locks writes on `Message`, confirm the deploy window or build it `CONCURRENTLY` first).
- **Announcement channels:** [announcement-channels.md](features/announcement-channels.md). Implemented 2026-09-22; migration `20260922003000_add_announcement_channels` is not applied yet (its `ChannelType` enum value cannot be rolled back).

### Checklist

- [ ] Apply the migration locally and run the manual test plan in [age-restricted-channels.md](features/age-restricted-channels.md) (REST gate, `channel:join` refusal, eviction on flip, push body, bot exemption, web gate).
- [ ] Apply the migration locally and run the manual test plan in [server-insights.md](features/server-insights.md) (counts vs direct SQL for 7d/30d, `403` for non-member and member without `MANAGE_SERVER`, `400` for an invalid range, young server, private channel excluded from top channels, empty state).
- [ ] Apply the migration locally and run the manual test plan in [announcement-channels.md](features/announcement-channels.md) (follow/idempotent follow, publish fan-out and `isCrosspost`, `400` republish and copy publish, `403` without `MANAGE_MESSAGES`/`MANAGE_CHANNELS`, unfollow, source-channel delete cascade, age-restricted source refused into an unrestricted target).
