# Feature Roadmap

This checklist captures product features that would make the app feel closer to a full Discord-class communication tool. Keep the checklist truthful: only mark a task complete after implementation and verification.

## Implementation Order

- [ ] Start with low-risk client polish that does not change backend contracts.
- [ ] Prefer features that reuse existing surfaces before adding new database models.
- [ ] Add API, Socket.IO, and Prisma work only after UI behavior and permission rules are clear.
- [ ] Preserve existing event names, DTOs, localStorage keys, upload fields, and permission behavior unless a feature explicitly requires a new contract.
- [ ] Run lint, typecheck, build, and focused tests for each completed feature slice.

## 1. Message Drafts Per Channel And DM

- [x] Define draft storage ownership and key format.
- [x] Store one draft per text channel.
- [x] Store one draft per direct message conversation.
- [x] Restore the draft when switching back to a channel or DM.
- [x] Clear the draft after a successful send.
- [x] Preserve the draft when send fails.
- [x] Preserve the draft when upload fails.
- [ ] Keep reply target handling explicit so stale reply context does not surprise users.
- [ ] Add tests for channel draft restore and clear-on-send.
- [ ] Add tests for DM draft restore and clear-on-send.
- [x] Verify localStorage migration/fallback behavior.
- [ ] Verify mobile composer remains reachable with restored draft text.

## 2. Threaded Replies

- [ ] Decide whether thread records are channel-scoped or message-scoped.
- [ ] Add Prisma models or fields for thread roots and participants.
- [ ] Add API endpoints for creating and listing threads.
- [ ] Add API endpoints for thread messages.
- [ ] Authorize thread access through the parent server/channel membership.
- [ ] Add Socket.IO events for thread message create/update/delete.
- [ ] Add unread tracking for thread replies.
- [ ] Add a compact thread preview under root messages.
- [ ] Add a thread panel that opens beside the chat on desktop.
- [ ] Add a full-screen thread view on mobile.
- [ ] Preserve message grouping inside thread timelines.
- [ ] Add tests for thread permission checks.
- [ ] Add tests for thread realtime delivery.
- [ ] Add UI smoke coverage for opening a thread and sending a reply.

## 3. Advanced Message Search

- [ ] Define supported query operators: `from:`, `in:`, `has:link`, `has:file`, `before:`, `after:`.
- [ ] Add a parser for search input with clear fallback behavior.
- [ ] Extend API search parameters without breaking existing search.
- [ ] Add indexed database query support for author, channel, date, attachments, and links.
- [ ] Show parsed filters in the search panel.
- [ ] Add empty state text for no results and invalid filters.
- [ ] Add result snippets with channel, author, timestamp, and match context.
- [ ] Add keyboard navigation across results.
- [ ] Add click-to-jump behavior with scroll anchoring.
- [ ] Add tests for parser edge cases.
- [ ] Add API tests for filter combinations.
- [ ] Add UI smoke coverage for `has:link` and `from:` searches.

## 4. Unread And Mention Inbox

- [ ] Define unread state ownership for channels, DMs, mentions, and thread replies.
- [ ] Add API support for listing unread and mention items.
- [ ] Add mark-read endpoint or reuse existing read receipt flow.
- [ ] Add Socket.IO updates for new mention/unread changes.
- [ ] Build an inbox panel from the existing notifications surface.
- [ ] Group inbox items by server and channel.
- [ ] Add mention, reply, thread, and pin item types.
- [ ] Add mark item read and mark all read actions.
- [ ] Add loading, empty, and error states.
- [ ] Add keyboard navigation for inbox rows.
- [ ] Add tests for unread permission visibility.
- [ ] Add UI smoke coverage for receiving and clearing a mention.

## 5. Role Color And Permission Preview

- [ ] Add a read-only permission preview panel in role settings.
- [ ] Show which channels a selected role can view.
- [ ] Show which actions a selected role can perform.
- [ ] Highlight denied permissions clearly without neon or warning-heavy styling.
- [ ] Preview combined permissions for a selected member.
- [ ] Explain inherited/default `@everyone` behavior in compact settings copy.
- [ ] Add channel filter support inside the preview.
- [ ] Add tests for permission aggregation helpers.
- [ ] Add UI tests for long role names and dense permission grids.
- [ ] Verify the settings modal remains readable on mobile.

## 6. Invite Links With Expiry

- [ ] Add invite data model with code, creator, server, expiry, max uses, and use count.
- [ ] Add API endpoint to create invites.
- [ ] Add API endpoint to list active invites for a server.
- [ ] Add API endpoint to revoke invites.
- [ ] Validate invite expiry and usage count during join.
- [ ] Add permission checks for invite creation and management.
- [ ] Build invite creation dialog with expiry and max-use controls.
- [ ] Build invite management section in server settings.
- [ ] Add copy invite link action with success/error feedback.
- [ ] Add tests for expired invite rejection.
- [ ] Add tests for max-use enforcement.
- [ ] Add UI smoke coverage for creating and joining by invite.

## 7. Voice Room Presence

- [ ] Define active voice occupancy payloads per server/channel.
- [ ] Broadcast join, leave, mute, camera, and screen-share presence events.
- [ ] Show voice participants nested under voice channel rows.
- [ ] Add quick join button on occupied voice channels.
- [ ] Show mute/deafen/camera/screen status icons.
- [ ] Add empty voice state that remains compact.
- [ ] Keep sidebar row heights stable when occupancy changes.
- [ ] Add tests for presence event reducers.
- [ ] Add Socket.IO tests for authorized voice presence visibility.
- [ ] Add UI smoke coverage for joining and leaving a voice channel.

## 8. Pinned Media, Files, And Links View

- [ ] Define media categorization for images, videos, audio, files, and links.
- [ ] Add API endpoint or client selector for channel media collections.
- [ ] Add tabs for Media, Files, and Links in the utility panel.
- [ ] Add thumbnail grid for images and videos.
- [ ] Add compact file rows with size and author metadata.
- [ ] Add link rows with hostname, author, and timestamp.
- [ ] Add filters for current channel versus server-wide results.
- [ ] Add loading, empty, and error states.
- [ ] Add keyboard navigation and accessible labels.
- [ ] Add tests for attachment categorization.
- [ ] Add UI smoke coverage for viewing an uploaded file and link.

## 9. Slash Commands

- [ ] Define command registry shape and ownership.
- [ ] Add client-side command parser for composer input.
- [ ] Add autocomplete popover triggered by `/`.
- [ ] Add command option hints and keyboard navigation.
- [ ] Implement `/me` as a client-rendered message action or server command.
- [ ] Implement `/nick` if nickname support exists or add the required API first.
- [ ] Implement `/poll` as a scoped follow-up feature.
- [ ] Implement `/invite` after invite links exist.
- [ ] Add validation and user-friendly errors for unknown commands.
- [ ] Add tests for parsing and autocomplete ranking.
- [ ] Add UI smoke coverage for opening autocomplete and executing a simple command.

## 10. Moderation Audit Timeline

- [ ] Confirm audit event taxonomy and retention rules.
- [ ] Record server, channel, role, member, invite, and message moderation events.
- [ ] Add API endpoint to list audit entries by server.
- [ ] Add filters by actor, action, target, and date.
- [ ] Add permission checks so only authorized members can view audit logs.
- [ ] Build audit log section in server settings.
- [ ] Show compact event rows with actor, action, target, and timestamp.
- [ ] Show metadata details in an expandable row or dialog.
- [ ] Add loading, empty, and error states.
- [ ] Add tests for event creation on moderation actions.
- [ ] Add tests for audit visibility permissions.
- [ ] Add UI smoke coverage for viewing a recent audit event.

## Cross-Feature Verification

- [ ] Verify desktop layout at 1440x900 and 1366x768.
- [ ] Verify mobile layout at 390x844.
- [ ] Verify no forbidden neon colors, panel gradients, or colored glows.
- [ ] Verify all new icon-only controls have accessible labels.
- [ ] Verify keyboard focus is visible in new menus, panels, and dialogs.
- [ ] Verify auth and permission paths before exposing private data.
- [ ] Verify optimistic UI reconciles with server responses.
- [ ] Update `docs/ui-redesign-plan.md` when a feature materially changes UI phase status.
