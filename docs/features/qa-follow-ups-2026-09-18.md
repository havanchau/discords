# Feature Spec: QA Follow-Ups 2026-09-18

Fixes for the defects found by the first full manual pass over Wave 2, Wave 3.1 and Wave 3.2, run on 2026-09-18 against a local stack (API, web, Postgres, Redis) with REST and Socket.IO scripts and headless Chrome at 1440x900 and 390x844. Each fix is small; they share one doc because they were found together and ship together.

The pass confirmed that the server-side acceptance criteria of every spec in scope hold. The items below are what failed, plus doc drift found on the way.

## Goal

Close the security gaps, functional bugs and UI breakage found by the pass, and bring the specs back in line with the code.

Acceptance criteria:

- A socket reaction never delivers a message to a room whose members cannot read it, and socket reactions run the REST emoji rules. **(Done on 2026-09-18, see Changes.)**
- Refreshing a token or verifying an email costs one hash lookup, whatever the number of sessions or tokens in the database.
- The server report queue does not show the content of a message from a channel the moderator cannot view.
- Every socket refusal that has an acknowledgement callback gets `{ error }` back instead of a generic `exception` event.
- A member who declines a group call gets no "missed call".
- Every API error thrown in the features below has an `en`/`vi` catalog entry; the listed hardcoded web strings are translated.
- Saving the profile form keeps an existing custom status expiry.
- A custom status shows next to the name in the member list.
- You appear online in your own member list.
- The unread divider survives a reload when the user did not scroll to the bottom.
- Dropdowns, popovers and tooltips inside a dialog are visible and clickable.
- On a 390 px screen: every message action is reachable, the channel list, DMs and user panel are reachable, and the composer input is usable.
- Settings a member cannot change are not offered to them.
- A REST channel send is delivered live, like a socket send.

## Scope

- **In scope**: the items under Changes.
- **Out of scope**:
  - **An account that owns a server cannot be deleted.** Deletion refuses owners (`apps/api/src/modules/users/account-deletion.service.ts:151-154`) and there is no server delete or ownership transfer route. That is a missing feature, not a bug; see open question 38.
  - Voice channel rows in the sidebar do nothing when clicked (`apps/web/src/components/workspace/ChannelSidebar.tsx:93-111`). Calls start from the text channel header; joining from a voice row lands with `voice-sfu.md`.
  - The report rate limit counts refused attempts too (`apps/api/src/modules/reports/reports.controller.ts:38` runs before validation at `:46`). The test-plan case passes; changing what counts is a product choice.
  - A forum post or DM with no text and no attachment answers 403, not 400 (`apps/api/src/modules/messages/messages.service.ts:216`). This predates these features and the web never sends such a body.
  - Spoofed `X-Forwarded-For` with `TRUST_PROXY_HOPS=1` when the API is reached without a proxy. Already documented in `ddos-protection.md`.
  - The i18n scanner cannot see messages thrown through a variable or JSX text with `{…}` interpolation. The strings it missed are fixed here by hand; a scanner rewrite is separate.

## Current Behavior

Evidence below comes from the 2026-09-18 QA run; every `file:line` was read in the run that found it.

- **Socket reaction (security)**: `reaction:toggle` broadcast `reaction:updated` to `channelRoom(body.channelId)`, a value the client supplies and nobody checked against the message's channel (`apps/api/src/modules/realtime/messages.gateway.ts`, before this change). A member of private channel P could send a P message id with the id of a public channel, and every member of the public channel received the full P message. The emoji was passed with `satisfies ReactionDto`, a compile-time check only, so a 200-character emoji was stored.
- **Token lookup (denial of service)**:
  - `refresh` loads every non-revoked, non-expired session of every user and runs `bcrypt.compare` (cost 12, `apps/api/src/modules/auth/auth.service.ts:242`) against each until one matches (`auth.service.ts:186-199`).
  - `verifyEmail` does the same over every unused email verification token (`auth.service.ts:127-138`).
  - With 133 active sessions, an invalid refresh token took 34 s. The route is unauthenticated and allows 30 requests per 15 minutes per IP (`apps/api/src/modules/auth/auth.controller.ts:69`).
- **Report queue**: `list()` checks only server-level `MANAGE_MESSAGES` (`apps/api/src/modules/reports/reports.service.ts:120-133`) and `reportSelect` always includes `content` (`:29`). A moderator denied `VIEW_CHANNEL` on a private channel got 403 on its messages but read the reported message's text in the queue.
- **Socket refusals**: only `message:create`, `soundboard:play` and now `reaction:toggle` catch `HttpException` and acknowledge `{ error }` through `SocketErrorTranslator`. Refusals from `message:update`, `message:delete`, `thread:message:create` (`messages.gateway.ts:94-132`), `voice:join`, `dm:call:ring`, `dm:call:decline` and `dm:call:cancel` (`apps/api/src/modules/realtime/voice.gateway.ts:46-78` and following) surface as a generic `exception {message:'Internal server error'}`. The web waits for its 5 s timeout and shows a generic "cannot join" (`apps/web/src/hooks/useChannelCall.ts:170-183`, `apps/web/src/hooks/useDirectCall.ts:112-124`).
- **Group call decline**: the group branch of `DmCallsService.decline` returns without removing the decliner from `ring.memberUserIds` (`apps/api/src/modules/realtime/dm-calls.service.ts:89-97`), so on expiry or cancel the decliner receives `ring-stopped {reason:'missed'}` and a `DM_MISSED_CALL` notification (`:132-158`).
- **Untranslated API errors**: these are thrown through a variable and have no entry in `apps/api/src/common/i18n/error-codes.ts`, so they return `code: null` in English:
  - `Only group conversations can be renamed`, `… can add members`, `… can remove members` (`apps/api/src/modules/direct-messages/direct-conversations.service.ts:44-48, 60-64, 83-87`).
  - The four event time errors in `apps/api/src/modules/events/event-status.ts:41,44,46,48`.
- **Hardcoded web strings** (seen in Vietnamese):
  - `apps/web/src/components/chat/MessageList.tsx:213-216`: channel welcome text.
  - `apps/web/src/components/chat/CallStage.tsx:45-53, 61, 72-79, 141`: "Voice call", participant count, "Join call", "Someone is sharing screen", "You", "Muted".
  - `apps/web/src/components/RemoteVideoTile.tsx:27-31`: "Sharing screen", "Muted", "In call".
  - `apps/web/src/components/settings/ServerSettings.tsx:237`: audit actions shown as lowercased enum names.
- **Custom status expiry**: the expiry select always starts at `never` (`apps/web/src/components/settings/ProfileSettings.tsx:174`) and every profile save sends all three status fields (`apps/web/src/hooks/useSettingsActions.ts:403-405`). `customStatusExpiry('never')` is `null` (`:798-803`), so changing only the bio makes a 30-minute status permanent. On the API, a write that sets `customStatusText` alone skips the stale-expiry cleanup (`apps/api/src/modules/users/users.service.ts:25-37`), so a new text stays hidden behind an old past expiry.
- **Custom status in the member list**: `user-profile.md` requires it; `MemberSidebar.tsx` never renders it and server member payloads do not select it (for example `apps/api/src/modules/servers/servers.service.ts:194`). `useRealtimeSocket.ts:296` merges `customStatus` into `member.user`, but nothing reads it.
- **Own presence**: `presence:update` goes to server rooms only (`apps/api/src/modules/realtime/presence.service.ts:126-133`). It fires from `handleConnection` (`apps/api/src/modules/realtime/realtime.gateway.ts:92`), before the socket joins any server room, so your own client keeps the `OFFLINE` it loaded and lists you under Offline. **Inferred, not fully traced**: the ordering is the cause.
- **Unread divider on reload**: the channel-open effect calls `markChannelRead(channel.id, lastMessage.id)` as soon as messages load (`apps/web/src/AppShell.tsx:432-433`), although `unread-scroll-position.md` defers it until the user scrolls near the bottom. A reload without scrolling loses the divider. When every loaded message is unread, no divider is shown (`AppShell.tsx:418` needs `lastReadAt` inside the page).
- **Layers**: `Dialog` overlay and content use `--z-overlay` (1000) (`apps/web/src/components/ui/Dialog.module.css:4,16`). `DropdownMenu` and `Popover` portal to `body` with `--z-dropdown` (100), `Tooltip` with `--z-tooltip` (200), `ContextMenu` with `--z-context-menu` (300) (`apps/web/src/styles/tokens.css:89-97`). Every menu opened inside a dialog renders under it, so Language, Status, Theme, "Clear after", slowmode and the AutoMod selects cannot be clicked.
- **Mobile**:
  - Message actions are absolutely positioned at `right: var(--space-4)` with no width limit (`apps/web/src/components/chat/MessageRow.module.css:253-265`); at 390 px, Reply, Thread, Pin, Save and Forward sit off-screen.
  - Under 720 px the channel sidebar is `display: none` (`apps/web/src/components/workspace/ChannelSidebar.module.css:263-267`) and the layout drops its column (`apps/web/src/components/app/AppLayout.module.css:25-29`) with nothing to replace it. Channels (except through Ctrl+K), DMs, friends, server settings, profile and sign-out are unreachable.
  - The composer is a fixed 7-column grid (`apps/web/src/components/chat/MessageComposer.module.css:7`) with no mobile override (`:233`); the input is 33 px wide.
- **Banner button**: `ProfileSettings.tsx:138` reuses `settingsAvatarRow`, a `64px 1fr` grid (`apps/web/src/components/settings/SettingsModal.module.css:196-201`), with one child, so "Change banner" is squeezed into 64 px.
- **Settings gating (UI only; the API enforces)**: a plain member sees "Channel settings" (`apps/web/src/components/chat/ChatHeader.tsx:185-190`) and an editable Server settings (`apps/web/src/components/workspace/ChannelSidebar.tsx:150`); saving shows the raw "Missing permission: MANAGE_CHANNELS". A 403 on the audit log renders as "No audit events yet." (`apps/web/src/components/settings/ServerSettings.tsx:233-246`).
- **REST send**: `POST /channels/:id/messages` does not emit `message:created` (`apps/api/src/modules/messages/messages.controller.ts:64-72`). The web falls back to REST when the socket is down, and others then never see the message live.
- **Status codes**: a repeated ban answers 201 (`apps/api/src/modules/servers/servers.controller.ts:118-126`); `member-bans.md` says 200. `POST /servers/:serverId/onboarding/accept` answers 201 (`servers.controller.ts:69`); `server-onboarding.md` says 200.
- **Console**: "flushSync was called from inside a lifecycle method" on every message list load: `useVirtualizer` keeps its default `useFlushSync` (`apps/web/src/components/chat/MessageList.tsx:71`) and `scrollToIndex` runs inside `useLayoutEffect` (`:97`, `:107`).

## Changes

### Socket reaction (done)

Implemented and verified on 2026-09-18, before this doc, because it leaked private messages:

- `reaction:toggle` validates the body with `ReactionDto` through a new `validateSocketReactionBody` in `apps/api/src/modules/realtime/socket-validation.ts`.
- It broadcasts to the channel of the returned message, never the client-sent id, and the payload's `channelId` is that channel.
- Refusals are acknowledged `{ error }`, like `message:create`.
- Verified with the QA repro scripts: a mismatched `channelId` delivers nothing to the other room; a 200-character emoji is refused with the REST message and nothing is stored.

### Token lookup

- Refresh tokens and email verification tokens are random (`randomUUID()`, `auth.service.ts:241`), so a salted slow hash adds nothing; password-reset tokens already use SHA-256 (`password-reset.md`).
- New refresh tokens and verification tokens are stored as the **SHA-256 hex** of the token, in columns with a **unique index**. `refresh` and `verifyEmail` do one indexed lookup by hash, then check revoked/used and expiry.
- Existing rows hold bcrypt hashes and can never match a SHA-256 lookup. After the deploy, every signed-in user refreshes once, gets 401 and signs in again; an unused verification link from before the deploy fails with the existing "Invalid or expired" message and the user asks for a new one.

### Report queue

- `list()` (and the detail read, if any) replaces `message.content`, `message.attachments` and any snapshot text with `null` and sets `contentHidden: true` when the moderator cannot view the message's channel, using the existing viewable-channel check. Author, reason, details and status stay visible so the report can still be dismissed or escalated.
- The web queue shows "You can't view this channel" in place of the text.
- This is the assumption for open question 37 until the product owner answers.

### Socket refusals

- `message:update`, `message:delete`, `thread:message:create`, `voice:join`, `dm:call:ring`, `dm:call:decline` and `dm:call:cancel` catch `HttpException` and return `socketErrors.ack(client, error)`, the pattern of `message:create`. Other errors still throw.
- `useChannelCall` and `useDirectCall` show the acknowledged message instead of waiting 5 s for the timeout.

### Group call decline

- The group branch of `decline` removes the decliner from `ring.memberUserIds` in the Redis ring record, so they get neither `ring-stopped 'missed'` nor the missed-call notification. When no member is left, the ring ends as `declined`.

### Translations

- Add `en`/`vi` catalog entries for the seven API messages above.
- Move the web strings listed in Current Behavior into the per-area locale modules under `apps/web/src/i18n/locales/{en,vi}/`, and map audit actions to translated labels with a fallback to the humanised enum.

### Custom status

- Web:
  - The expiry select gets a "Keep current" option, selected by default when a status is set.
  - Status fields are sent only when the user changed the text, emoji or expiry.
  - The "Today" preset ends at local midnight, not 24 hours later.
- API: any write that sets status text or emoji without an expiry clears a stored expiry that is already in the past.
- Server member payloads select `customStatusText`, `customStatusEmoji` and `customStatusExpiresAt`, and resolve an expired status to `null` with the same helper the users module uses. `MemberSidebar` renders the status under the name, truncated to one line.

### Own presence

- `PresenceService` also emits `presence:update` to the user's own user room, so every tab of that user sees its own status.

### Unread divider

- The channel-open effect no longer marks the channel read. `MessageList` marks it read, with the last message id, when the user reaches the bottom (the existing near-bottom check), or at once if all messages fit without scrolling. Switching channels while above the bottom leaves the channel unread, as the spec intends.
- When `lastReadAt` is older than the first loaded message, the divider goes above the first loaded message.
- The first unread message always renders with its author line, even when it would normally be grouped.

### Layers

- `Dialog` overlay and content move to `--z-modal` (500).
- `DropdownMenu`, `Popover`, `Tooltip` and `ContextMenu` move to `--z-overlay` (1000). These float over whatever opened them and close on outside interaction, so they belong on the top layer.
- `--z-notification` (600) stays above dialogs, so toasts are unchanged.

### Mobile

- Under 720 px, message actions become a wrapping row anchored inside the message (`max-width: calc(100% - 2 * var(--space-4))`, `flex-wrap: wrap`), so every button is on screen.
- Under 720 px, the chat header gets a menu button that opens the server rail and channel sidebar (including the user panel) as a left drawer, built on the existing `Dialog` primitive so focus and Esc handling are shared. Choosing a channel or DM closes it.
- Under 720 px, the composer grid collapses its secondary buttons (schedule, sticker, emoji, voice) into one "More" popover, so the input keeps the remaining width.
- The desktop layout does not change.

### Banner button

- The banner row uses its own single-column class, so the button gets its natural width.

### Settings gating

- The web computes the viewer's effective permissions from data it already loads (roles, overrides, owner id) with the shared permission helpers in `packages/shared`.
- "Channel settings" is shown only with `MANAGE_CHANNELS` on that channel.
- Server settings sections that need `MANAGE_SERVER`, `MANAGE_ROLES`, `BAN_MEMBERS` or `MANAGE_MESSAGES` are hidden without them (the audit log needs `MANAGE_SERVER`, `apps/api/src/modules/servers/servers.service.ts:160`); the Overview stays read-only.
- A 403 on the audit log shows an error state, not the empty state.

### REST send

- `POST /channels/:id/messages` emits `message:created` to the channel room and runs the same unread update as the socket path, through the shared publisher.

### Status codes

- A repeated ban answers 200, like reports (`reports.controller.ts:46-48`); onboarding accept answers 200 with `@HttpCode(200)`.

### Console warning

- `MessageList` passes `useFlushSync: false` to `useVirtualizer`.

### Doc drift fixed in place

- `dm-calls.md`: rings live in Redis with a deadline set swept every 2 s (`apps/api/src/modules/realtime/dm-call-rings.ts:14-21`), not in memory; the ring rate limit is per user (`socket-guards.ts:17-20`).
- `group-dm.md`: the gateway uses the Redis adapter (`apps/api/src/modules/realtime/realtime.gateway.ts:39`), not the single-instance one.
- `automod.md`: a blocked socket edit is acknowledged `{ error }` once "Socket refusals" ships.
- `wave-3-2-follow-ups.md` Risks: unknown top-level socket fields are dropped, not refused; only unknown nested attachment fields are refused (`socket-validation.ts`).
- `stickers-and-soundboard.md` test plan: a sent sticker shows the "Sticker deleted" placeholder after deletion, as its Deviations section says.
- `i18n-localization.md`: the example code is `EMAIL_OR_USERNAME_ALREADY_EXISTS` (`error-codes.ts:46`).

## Technical Approach

- **API**
  - `apps/api/src/modules/realtime/socket-validation.ts`, `messages.gateway.ts`: reaction validation and room (done); ack wrappers.
  - `apps/api/src/modules/realtime/voice.gateway.ts`, `dm-calls.service.ts`, `dm-call-rings.ts`: ack wrappers and the decliner removal.
  - `apps/api/src/modules/auth/auth.service.ts`: `sha256Hex(token)` helper, `findUnique` by hash in `refresh` and `verifyEmail`, hash on create.
  - `apps/api/src/modules/reports/reports.service.ts`: redaction by viewable channel.
  - `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/servers/servers.service.ts` and the other member selects: custom status.
  - `apps/api/src/modules/realtime/presence.service.ts`: user-room emit.
  - `apps/api/src/modules/messages/messages.controller.ts`: REST broadcast.
  - `apps/api/src/modules/servers/servers.controller.ts`: status codes.
  - `apps/api/src/common/i18n/error-codes.ts`: seven entries.
- **Shared**: `MessageReportView.message` gets `contentHidden: boolean`; the server member user type gets the three custom-status fields.
- **Web**
  - `components/ui/{Dialog,DropdownMenu,Popover,Tooltip,ContextMenu}.module.css`.
  - `components/chat/{MessageRow,MessageComposer}.module.css`, `MessageList.tsx`, `CallStage.tsx`, `RemoteVideoTile.tsx`, `ChatHeader.tsx`.
  - A new `components/workspace/MobileNavDrawer.tsx`.
  - `components/workspace/{ChannelSidebar,MemberSidebar}.tsx`.
  - `components/settings/{ProfileSettings,ServerSettings,SettingsModal}.*`.
  - `hooks/{useSettingsActions,useChannelCall,useDirectCall}.ts`.
  - The channel-open effect in `AppShell.tsx`, moved out per `appshell-split.md` where they overlap.
  - `en`/`vi` locale modules.
- **DB**: migration `20260918006000_hash_tokens_sha256`:
  - Adds a unique index on `Session.refreshHash` and on `EmailVerificationToken.tokenHash`.
  - Columns keep their names and types, because a hex SHA-256 fits the existing string column.
  - No data change: old bcrypt values stay and stop matching.
  - `down()` drops the two indexes.
- **Libraries**: none added; SHA-256 comes from `node:crypto`.

## Trade-offs

- **Token lookup**:
  - A `<sessionId>.<secret>` token format keeping bcrypt was considered. It needs a format change as well, keeps a slow hash on an unauthenticated route, and differs from how password-reset tokens are stored.
  - SHA-256 plus a unique index is the standard for high-entropy random tokens.
  - Its cost is one forced sign-in for every user at deploy time. Keeping a legacy bcrypt fallback would keep the denial of service, so there is none.
- **Report redaction vs. hiding the report**: hiding reports from channels the moderator cannot view would let a report sit unseen. Redacting keeps it actionable, and a moderator with access can still read it.
- **Mobile drawer vs. a separate mobile layout**: a drawer reuses the existing sidebar components and the `Dialog` focus handling; a separate layout would duplicate them.
- **Layer tokens**: adding a new "floating" token was considered. Moving dialogs to the existing `--z-modal` token uses the token scale as named.
- **Web permission gating**: gating is presentation only; the API stays the enforcement point. Computing permissions from loaded data avoids a new endpoint; the risk is drift from the API rules, reduced by using the shared helpers.

## Risks & Rollback

- **Forced sign-in**: every session ends at deploy. Rollback: revert the code and drop the indexes with `down()`. Sessions created after the deploy then fail to refresh, so users sign in once more.
- **Mobile drawer**: new UI. Rollback is a code revert; the desktop layout is untouched.
- **Mark-read timing**: a channel can now stay unread after it was opened. That is the behavior `unread-scroll-position.md` describes, but users used to instant clearing may notice.
- **Report redaction**: a moderator without channel access can no longer judge the content alone and must escalate.
- **Not covered**: multi-instance behavior of the ring change (one API instance locally), push-notification locale, real touch devices.

## Test Plan

The repository keeps no automated tests (`RULE.md`). Gates: `typecheck`, `lint`, `build`, `check:file-size`, `i18n:check`, `ui:scan`, `docs:check`, `ui:smoke`. Manual scenarios reuse the QA scripts from the 2026-09-18 run (REST and Socket.IO clients, headless Chrome at 1440x900 and 390x844):

1. Socket reaction with a mismatched `channelId` → nothing reaches the other room; a 200-character emoji → ack `{ error }`, no row. (Run 2026-09-18: pass.)
2. With about 150 active sessions, an invalid refresh token answers 401 in under 100 ms; a valid refresh rotates the token; a pre-deploy session gets 401; a new email verification link works once, then fails.
3. Moderator without `VIEW_CHANNEL` on a private channel: queue entry has `contentHidden: true` and no text. With access: text shown. Failure case: a non-moderator still gets 403.
4. `voice:join` by a member who has not accepted the rules → ack `{ error }` with the rules message, shown at once in the web. `message:update` by a timed-out member → ack `{ error }`.
5. Group call A, B, C; C declines; nobody answers → C gets no `ring-stopped` and no missed-call notification; B does.
6. With `vi`: event time errors, the three group-DM errors, the channel welcome text, call stage and audit actions show in Vietnamese.
7. Set a 30-minute status, change only the bio, save → the expiry is kept; the status shows in the member list of another client; after expiry it disappears from both.
8. Sign in → you are listed as Online in your own member list.
9. Open a channel with 25 unread, do not scroll, reload → divider still shown. Scroll to the bottom → the channel is marked read.
10. Open Edit profile → Language menu → pick Tiếng Việt with the mouse; same for slowmode and the AutoMod selects.
11. At 390x844: open the drawer, switch channel, open a DM, sign out; hover a message → Save and Forward are on screen and work; type in the composer.
12. As a plain member: no "Channel settings" item; server settings show only allowed sections; audit log shows an error, not the empty state.
13. Stop the socket, send over REST → another client receives the message live.
14. Repeated ban → 200; onboarding accept → 200.
15. No "flushSync" warning in the console when opening a channel.

## Deployment Notes

- Migration `20260918006000_hash_tokens_sha256` ships with the code. **All users are signed out once** when it deploys; announce it.
- No new env variables.
- No cache or queue to clear.

## Deviations

- **Shared member user type**: the Technical Approach said the server member user type gets "the three custom-status fields" (`customStatusText`, `customStatusEmoji`, `customStatusExpiresAt`). `PublicUser` (`packages/shared/src/api-contract.ts`) already carries a computed `customStatus: CustomStatus | null` for this purpose (used by `toProfileView`/`toCustomStatus`, `apps/api/src/modules/users/user-profile.ts`), and `ServerMemberDetail.user: PublicUser` already includes it. `getServerForUser` (`apps/api/src/modules/servers/servers.service.ts`) selects the three raw columns from the database and resolves them through the existing `toCustomStatus` helper into that same `customStatus` field, instead of exposing three new raw fields on the wire — one shape for "does this user have a custom status right now" everywhere, matching how `useRealtimeSocket.ts`'s `presence:update` handler already merges `customStatus` into `member.user`. No shared type change was needed.
- **REST send wiring**: to let `MessagesController` share the unread-broadcast logic with `MessagesGateway` without a circular module import (`RealtimeModule` imports `MessagesModule`), `RealtimeUnreadService` moved into its own `RealtimeUnreadModule` (`apps/api/src/modules/realtime/realtime-unread.module.ts`), imported by both `MessagesModule` and `RealtimeModule`. Behavior is unchanged; this is a wiring detail the Technical Approach did not call out.
