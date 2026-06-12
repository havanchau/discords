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

- [x] Add unit tests for pure helpers, reducers, parsers, permission aggregation, and payload transforms.
- [x] Add API tests for auth, permission, validation, persistence, and error paths.
- [x] Add Socket.IO tests for authorized delivery and blocked delivery when realtime behavior changes.
- [x] Add web component or hook tests for client state that can regress.
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
- [x] **ISSUE-08 — Backend API tests:** add backend unit/integration tests for permissions, auth/session lifecycle, message create/edit/delete validation, and protected endpoint 401/403 behavior.
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
