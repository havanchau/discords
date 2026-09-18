# Feature Spec: Stage Channels

A `STAGE` channel type for one-to-many audio: a small set of speakers publish audio/video, everyone else joins as silent audience, and moderators manage who can speak.

**Depends on**: [`voice-sfu.md`](./voice-sfu.md) — stage channels need per-participant publish/subscribe control (an audience member must be able to join a call without ever uploading media, and a speaker's publish rights must be revocable mid-call), which the current full-mesh `RTCPeerConnection`-per-peer model (`apps/web/src/hooks/useChannelCall.ts`) has no mechanism for: every mesh participant is already a full publisher/subscriber to every other participant by construction. `voice-sfu.md` is now implementation-ready (self-hosted LiveKit, 2026-09-18) but still unimplemented as of this writing (no LiveKit code exists in the repo) — this doc cannot ship before that one does, and this doc's design assumes `voice-sfu.md`'s LiveKit token-issuance point (`voice:join` returning `{ livekit: { url, token } }`) exists.

**Status**: implemented 2026-09-18 (uncommitted) together with `voice-sfu.md`, and verified locally against a LiveKit container — see Deviations From The Original Design. A stage works only where `VOICE_TRANSPORT=livekit`.

## Goal

A `STAGE` channel holds a large audience that joins muted-by-default with no publish rights, plus a small set of speakers who can publish audio/video; a member can "request to speak," and a moderator (`MUTE_MEMBERS`-equivalent stage permission) invites or removes speakers.

**Acceptance criteria**:

- [x] `voice:join` on a `STAGE` channel returns the caller's role in the stage (`audience` or `speaker`) alongside the existing `{ participants }` shape; the LiveKit access token minted for the caller (per `voice-sfu.md`'s Changes §2-4) grants `canPublish: false` for `audience` and `canPublish: true` for `speaker` (both get `canSubscribe: true`).
- [ ] Any member with `CONNECT_VOICE` can join a stage as audience; only moderator-added speakers, and the server owner, join as speakers directly.
- [x] An audience member can send a "request to speak"; a stage moderator can approve (promoting to speaker) or the member can be invited directly without requesting.
- [x] A stage moderator can move a speaker back to audience ("remove from stage"), which revokes their LiveKit publish grant **without disconnecting their call** — done via `RoomServiceClient.updateParticipant` (server-side permission update), not by reissuing or invalidating the participant's access token.
- [ ] Existing `voice:state`, `voice:active`, `voice:leave` contracts continue to work unchanged for stage participants (per `voice-sfu.md`'s stability goal).
- [x] A non-moderator cannot self-promote to speaker by any client-side action — the LiveKit token/permission is only ever granted publish rights after the server-side role check passes.
- [x] A departed member's stale `StageSpeakRequest`/`StageSpeaker` row is removed when they leave the server (kick, ban, or voluntary leave), so a moderator's queue never shows a request from someone no longer in the server (see Changes §7).

## Scope

**In scope**

- `STAGE` channel type, per-participant stage role (`audience` | `speaker`) tracked alongside the existing `CallParticipant` bookkeeping, request-to-speak, moderator invite/approve/remove-from-stage actions, LiveKit publish-grant toggling via `RoomServiceClient.updateParticipant` per `voice-sfu.md`'s token-issuance point.
- Adding the `MuteMembers` permission to the API's channel-permission catalog (`apps/api/src/modules/permissions/channel-permission.ts`), which is missing it today (Current Behavior) even though it already exists in `packages/shared/src/permissions.ts`.
- Cleanup of `StageSpeaker`/`StageSpeakRequest` rows when a member is removed from the server (kick, ban, voluntary leave).
- Stage UI: audience view (listen-only, raised-hand button), speaker view (existing call controls), moderator controls (speaker queue, invite/remove).

**Out of scope**

- Scheduled stages / stage topics and start times (could later reuse `docs/features/server-events.md`'s event model, not designed here).
- Recording a stage.
- Text chat inside a stage channel (a stage is audio/video-only; this doc does not add a `STAGE` variant of channel messaging).
- Stage discovery/browsing across servers.
- Multiple concurrent "sub-stages" or breakout rooms.
- A brand-new `STAGE_SPEAK`/`STAGE_MODERATE` permission pair (reusing `SPEAK_VOICE` + `MUTE_MEMBERS` instead, per open question #23's resolved assumption).

## Current Behavior

- `ChannelType` is `TEXT | VOICE | FORUM` (`apps/api/prisma/models/channels.prisma:1-5`) — **note: no `STAGE` value exists today, and the type set is not `TEXT | VOICE` as an earlier draft of this doc assumed; `FORUM` was added by `forum-channels.md` and is the precedent for adding a new `ChannelType` value rather than a flag.**
- `voice:join` (`apps/api/src/modules/realtime/voice.gateway.ts:45-81`) treats every joiner identically: it calls `access.authorizeCallJoin(user.id, body.channelId)` (line 59, checks membership only via `requireChannelMember`, `realtime-access.service.ts:33-42`), builds a `CallParticipant` (line ~61), joins the `call:<channelId>` room, and returns `{ participants: existingParticipants }`. Every participant in a call today is symmetric — a full publisher and subscriber to every peer, by construction of the mesh (`useChannelCall.ts:32`, one `RTCPeerConnection` per remote peer).
- `CallParticipant` (`call-registry.service.ts:7-16`) has `mode: 'voice'|'video'|'screen'`, `isMuted`, `isCameraOff`, `isSharingScreen` — no field for "can this participant publish media at all."
- `SPEAK_VOICE` and `CONNECT_VOICE` exist as channel-scoped permissions in both `packages/shared/src/permissions.ts:10,12` and `apps/api/src/modules/permissions/channel-permission.ts:11-12`, and already flow through `ChannelPermissionOverride` per-channel/per-role/per-member grants (`evaluateChannelPermission`, `channel-permission.ts:44-76`). No server code currently reads `SPEAK_VOICE` at runtime to differentiate within a call (grepped: all hits are the permission catalog and its label) — this doc is the first thing to actually enforce it.
- **`MUTE_MEMBERS` exists in `packages/shared/src/permissions.ts:13` but is missing from `apps/api/src/modules/permissions/channel-permission.ts`'s own `Permission` const (lines 1-13, which stops at `UploadFiles` — no `MuteMembers`/`DeafenMembers`)** and is not read at runtime anywhere in `apps/api/src` except as a string literal in `server-template-builtins.ts:26` (a built-in role's permission list). `PermissionsService.requireServerPermission` (`permissions.service.ts:32`) takes a `PermissionValue` typed from that same `channel-permission.ts` const (re-exported at `permissions.service.ts:12`), so `requireServerPermission(userId, serverId, Permission.MuteMembers)` **does not compile today** — this doc's Technical approach adds the missing const entry as a required first step, not an assumption.
- Server-level member removal (kick: `server-moderation.service.ts:28-45`; ban: lines 104-148) deletes the `ServerMember` row directly (`prisma.serverMember.delete`/`deleteMany`) and emits `server:member-removed` (line 171) — neither path today cleans up any other per-member, per-server data beyond the membership and ban rows themselves; there is no existing precedent in this codebase for cascading a kick/ban into unrelated per-channel state (grepped `server-moderation.service.ts` for any `deleteMany` beyond `serverMember`/`serverBan`: none found). A voluntary "leave server" endpoint was not located in `apps/api/src/modules/servers/*.ts` in this session — **inferred, not read**: if one exists elsewhere, it is not covered by the cleanup plan in Changes §7 without extending it, and this gap is flagged in Risks.
- `voice-sfu.md`'s Changes §2-4 (2026-09-18 revision) describe `voice:join` minting a LiveKit access token after `authorizeCallJoin` succeeds, with room name = the call id and identity = `${userId}:${socketId}` — that token-issuance point is what this doc scopes to publish-vs-subscribe via the token's `canPublish` grant, plus live updates via `RoomServiceClient.updateParticipant`.

## Changes

### Rules

- `STAGE` is a new `ChannelType`. A `STAGE` channel's `CONNECT_VOICE` permission (existing) governs who may join at all (as audience, at minimum); a new `SPEAK_VOICE`-on-stage check governs who joins with publish rights.
- Joining a `STAGE` channel: `voice:join` calls `access.authorizeCallJoin` exactly as today, then (new, stage-only) computes the caller's stage role: `speaker` if they are in the channel's current `StageSpeaker` set (see Data model), else `audience`. Holding `SPEAK_VOICE` alone is **not** sufficient to be a speaker — a member is never a speaker by permission alone; permission only allows a moderator to _add_ them to the speaker set (via `POST .../stage/speakers`, which itself requires the target to hold `SPEAK_VOICE` on that channel — see below). Being audience is otherwise the default regardless of role.
- Stage moderators are members holding `MUTE_MEMBERS` (reused — no new server-level permission, matching the repo's pattern of reusing an existing close-enough permission before adding a new one, as `server-events.md` did with `MANAGE_SERVER`) on the channel's server, checked via `PermissionsService.requireServerPermission(userId, serverId, Permission.MuteMembers)` once `Permission.MuteMembers` is added (see Technical approach — it does not exist in `channel-permission.ts` today).
- `POST /channels/:channelId/stage/request-to-speak`: audience member adds themselves to a `StageSpeakRequest` queue; idempotent if already requested (`upsert`, no duplicate row); rejected (`400`) if the caller is already a speaker.
- `DELETE /channels/:channelId/stage/request-to-speak`: withdraw own pending request; no-op (still `{ ok: true }`) if none exists.
- `POST /channels/:channelId/stage/speakers`: moderator-only (`MUTE_MEMBERS`), `{ userId }`; `403` if the target lacks `SPEAK_VOICE` on the channel (a moderator cannot promote someone the channel's own permission grants would never let speak); on success, adds to the `StageSpeaker` set (consuming any pending `StageSpeakRequest` for that user in the same transaction), emits `stage:role-changed`, and — if that user has an active call session in this channel (looked up via `CallRegistryService`) — calls LiveKit's `RoomServiceClient.updateParticipant(roomName, identity, { permission: { canPublish: true, canSubscribe: true } })` for every one of that user's connected socket identities (`${userId}:${socketId}`) in the room, per `voice-sfu.md`'s identity scheme, so publish rights take effect immediately without a reconnect.
- `DELETE /channels/:channelId/stage/speakers/:userId`: moderator-only, removes from `StageSpeaker`, emits `stage:role-changed`, and (if the user has an active session) calls the same `updateParticipant` with `canPublish: false`. Removing yourself (a speaker stepping down) is allowed without the moderator permission.
- A speaker who is later removed **stays connected to the call** (per acceptance criteria) — this mirrors `voice-sfu.md`'s general principle that call membership (`CallRegistryService`) is separate bookkeeping from media transport; only the LiveKit permission changes, via `RoomServiceClient`, not the call membership or the socket connection.
- Audit: `STAGE_SPEAKER_ADD` / `STAGE_SPEAKER_REMOVE` `{ userId }`, following the existing audit-action-string convention (`servers.service.ts`'s `writeAuditLog` calls, e.g. `servers.service.ts:153`).
- **Cleanup on member removal (resolves open question #24)**: when a member is kicked or banned (`server-moderation.service.ts:28-45` and `104-148`), the same transaction that deletes the `ServerMember` row also deletes that user's `StageSpeaker` and `StageSpeakRequest` rows across every `STAGE` channel of that server (`deleteMany({ where: { userId, channel: { serverId } } })` on both tables), and — if the removed member currently holds a speaker slot in an active call — the removal path calls `RoomServiceClient.removeParticipant` (or relies on the kick/ban's existing socket-disconnection behavior, if `server-moderation.service.ts` already forces the target's sockets to leave server rooms; this needs confirming against the exact disconnection mechanism at implementation time, since this doc did not trace that far). **Recommendation: treat this as required, not optional** — a stale speaker slot for a banned user is a moderation-bypass-adjacent bug (a banned user who never had their publish grant revoked keeps broadcasting into the room via their still-open LiveKit session), which is a materially worse outcome than a stale row in a request queue. A voluntary "leave server" path, if one exists, must run the same cleanup; this doc could not locate that endpoint to add the call to it (Current Behavior) and flags it as a follow-up verification step for whoever implements this.
- Left-over `StageSpeakRequest` rows for a member who leaves **without** being kicked/banned (if a voluntary leave path exists and is not extended per the point above) are not actively purged by anything else in this design — a moderator's queue could in theory show a stale request until acted on and rejected as "user not found," which is the same "flagged, not solved" posture the previous draft of this doc took, narrowed now to only the voluntary-leave gap rather than kick/ban.

### Edge cases

| Case | Expected behavior |
|---|---|
| Audience member tries to publish media directly (bypassing the UI) | LiveKit rejects the publish because the participant's `canPublish` grant is `false` — enforced server-side via the LiveKit permission itself, not just hidden in the client UI, per `RULE.md`'s "hiding a button is not authorization." |
| Last speaker leaves the stage | Stage continues with zero speakers; audience stays connected, listening to silence — no auto-promotion happens (out of scope: picking a new speaker automatically). |
| Moderator removes a speaker who never requested (invited directly) | Same removal path; no dependency on a prior request row existing. |
| Member is kicked or banned while a pending speak request or an active speaker slot exists | `StageSpeaker`/`StageSpeakRequest` rows for that user are deleted in the same transaction as the kick/ban (Changes §7); an active speaker's LiveKit publish grant is revoked as part of the same removal. |
| Member voluntarily leaves the server while a pending speak request exists | **Open**: no voluntary-leave endpoint was located to attach the same cleanup to; flagged in `open-questions.md` rather than assumed. |

## Technical Approach

### Data model

```prisma
enum ChannelType {
  TEXT
  VOICE
  FORUM
  STAGE
}

model StageSpeaker {
  channelId String
  userId    String
  addedAt   DateTime @default(now())
  channel   Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([channelId, userId])
}

model StageSpeakRequest {
  channelId   String
  userId      String
  requestedAt DateTime @default(now())
  channel     Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([channelId, userId])
}
```

Migration `20260918000000_add_stage_channels` (next after the latest existing migration, `20260917014000_add_stickers_and_soundboard`). Adding `STAGE` to the enum and two new tables is additive; no backfill, no lock risk on existing rows (`Channel.type` keeps its existing values and `@default(TEXT)`).

Both tables are keyed by `(channelId, userId)`, not by a call session, so they represent "current stage roster," not call history — consistent with `CallRegistryService` also being in-memory/ephemeral call state rather than persisted per-session rows. The `onDelete: Cascade` on `userId` only fires on a `User` row deletion (account deletion), **not** on `ServerMember` removal (kick/ban/leave) — that is why Changes §7's explicit `deleteMany` in the moderation transaction is required rather than relying on the schema's cascade.

**Also required** (not itself a migration, since `Permission` is a TypeScript const, not a DB enum): add `MuteMembers: 'MUTE_MEMBERS'` to `apps/api/src/modules/permissions/channel-permission.ts`'s `Permission` const (currently ends at `UploadFiles`, line 13), matching the value already defined in `packages/shared/src/permissions.ts:13`. Without this, `PermissionsService.requireServerPermission(..., Permission.MuteMembers)` cannot be written — `Permission` there is re-exported from `channel-permission.ts` (`permissions.service.ts:5,12`), which is the one missing the entry.

### API

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/channels/:channelId/stage/request-to-speak` | — | `{ ok: true }` |
| `DELETE` | `/channels/:channelId/stage/request-to-speak` | — | `{ ok: true }` (withdraw own request) |
| `GET` | `/channels/:channelId/stage` | — | `{ speakers: StageMember[], requests: StageMember[] }` |
| `POST` | `/channels/:channelId/stage/speakers` | `{ userId }` | `{ ok: true }` — `400` if `userId` lacks `SPEAK_VOICE` on the channel |
| `DELETE` | `/channels/:channelId/stage/speakers/:userId` | — | `{ ok: true }` |

### Realtime

- `voice:join` (unchanged event name) response gains `stageRole: 'audience' | 'speaker'` for `STAGE` channels, alongside `voice-sfu.md`'s `transport`/`livekit` fields — additive, so `voice-sfu.md`'s stability goal for the event contract holds. The LiveKit token minted for a `STAGE` join has `canPublish` set from `stageRole` at mint time (`speaker` → `true`, `audience` → `false`); later promote/demote does not reissue the token, it calls `RoomServiceClient.updateParticipant` per Changes §5-6.
- New event `stage:role-changed` `{ channelId, userId, role }` emitted to `call:<channelId>` whenever the speaker set changes (add/remove), so open clients update their local UI (speaker view vs. audience view) — the actual LiveKit permission change is already in effect server-side by the time this event is emitted, since `RoomServiceClient.updateParticipant` is called in the same request/transaction before the broadcast.
- New event `stage:speak-request-updated` `{ channelId, userId, requested }` to the `call:<channelId>` room, for the moderator's live speaker-queue UI.

### Files

- API: `apps/api/prisma/schema.prisma` (or `models/channels.prisma`), new migration, `apps/api/src/modules/permissions/channel-permission.ts` (add `MuteMembers` to `Permission`), new `apps/api/src/modules/realtime/stage.service.ts` (speaker set, request queue, permission checks, `RoomServiceClient.updateParticipant` calls — separate from `CallRegistryService` per its existing "membership/state, not media" boundary), `apps/api/src/modules/realtime/voice.gateway.ts` (`voice:join` computes and returns `stageRole`), new REST controller for the `stage/*` endpoints (REST fits better here since these are moderator actions, not high-frequency signaling, matching the existing REST-for-CRUD / socket-for-live-broadcast split the repo already uses for e.g. bans vs. `server:member-removed`), new `apps/api/src/modules/channels/dto/stage-speaker.dto.ts`, `apps/api/src/modules/servers/server-moderation.service.ts` (kick/ban transactions gain the `StageSpeaker`/`StageSpeakRequest` cleanup from Changes §7).
- Web: `apps/web/src/api.ts`, `apps/web/src/hooks/useChannelCall.ts` (branches on `stageRole` to skip local media capture entirely for audience, per `voice-sfu.md`'s note that media capture logic is otherwise unchanged), new `apps/web/src/components/stage/StageAudienceView.tsx`, `StageSpeakerControls.tsx`, `StageModeratorPanel.tsx`, `apps/web/src/components/workspace/ChannelSidebar.tsx` (new icon branch, mirroring the `VOICE` branch at line 93), `apps/web/src/i18n/locales/en.ts` / `vi.ts`.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| New `STAGE` channel type vs. a "stage mode" flag on `VOICE` channels | A flag is a smaller migration (one boolean instead of an enum value) | Blurs two genuinely different UIs (full-mesh-style symmetric call vs. broadcast) under one type, and the sidebar/UI already branches on `ChannelType` (`ChannelSidebar.tsx:93`) — a type is the more consistent extension point, matching how `forum-channels.md` also added `FORUM` as a new `ChannelType` rather than a flag | **Chosen**: new `ChannelType` value, consistent with the repo's existing type-based branching |
| Reuse `SPEAK_VOICE` + `MUTE_MEMBERS` vs. a brand-new `STAGE_MODERATE`/`STAGE_SPEAK` permission pair | Avoids adding permissions that existing roles would silently lack (same reasoning `server-events.md` used for `MANAGE_SERVER`); both permissions already exist, so this is their first real enforcement | `SPEAK_VOICE` was originally scoped as "can speak in this voice channel," a slightly different meaning than "eligible to be granted a stage speaker slot" — conflating the two could surprise an admin who granted `SPEAK_VOICE` broadly expecting only ordinary voice-channel behavior; `MUTE_MEMBERS` is not currently enforced anywhere at runtime (Current Behavior), so this doc is also its first real use | **Chosen** (confirmed 2026-09-18, closing open question #23), with the caveat flagged in Risks — the alternative (new permissions) is cleaner semantically but adds permission-catalog churn for a first version |
| LiveKit `RoomServiceClient.updateParticipant` vs. reissuing a new access token on promote/demote | Matches the acceptance criterion directly ("without disconnecting their call... without reconnecting"); a token reissue would require the client to reconnect (a new JWT only takes effect at `Room.connect()` time), which is a visible, disruptive UX for something that should feel instant | Requires the API to hold a `RoomServiceClient` (server-to-server LiveKit admin call) in addition to the token-minting `AccessToken` usage, and to know the LiveKit identity/room-name scheme (`voice-sfu.md`'s `${userId}:${socketId}` / call-id-as-room-name) precisely enough to target the right session(s) | **Chosen**: this is the only mechanism that satisfies the "no reconnect" requirement; a token-reissue approach was not seriously considered as an alternative because it does not meet the stated acceptance criterion |
| REST endpoints for stage moderation vs. socket events | Matches the existing split: moderation actions with audit trails go through REST controllers (bans, kicks, timeouts), while `voice.gateway.ts` handles only high-frequency call signaling | A REST-only path means moderator UI needs a manual refetch or the new `stage:*` broadcast events to stay live, adding two new socket events anyway | **Chosen** REST for the mutating actions plus broadcast events for live sync, mirroring `member-bans.md`'s pattern (`POST /servers/:serverId/bans` + `server:member-removed` broadcast) |

## Deviations From The Original Design

Written back after implementing, so the doc matches the code:

- **Module layout.** `StageService`, `StageController` and the DTO live in
  `apps/api/src/modules/stage/` (`stage.service.ts`, `stage.controller.ts`,
  `dto/stage-speaker.dto.ts`), not in `realtime/` and `channels/dto/`: the kick/ban path in
  `ServersModule` and the voice gateway in `RealtimeModule` both need the service, and `ChannelsModule`
  already imports `ServersModule`, so either original home would create a module cycle. The removal
  cleanup is `stage/stage-member-cleanup.ts` (`deleteMemberStageRows`), called inside the kick and ban
  transactions in `server-moderation.service.ts`.
- **LiveKit calls go through `LivekitService`** (`apps/api/src/modules/livekit/livekit.service.ts`).
  It finds a user's connections by listing the room's participants and matching the
  `${userId}:` identity prefix, instead of asking `CallRegistryService`, so the stage module does not
  depend on the realtime module. A user with no connection is skipped; their next join token carries
  the new right.
- **Order of writes.** Promote: roster row first, then `updateParticipant(canPublish: true)`.
  Demote: `updateParticipant(canPublish: false)` first, then the row delete — a failed revoke must
  not leave someone listed as audience while still publishing. A LiveKit failure answers `503 Voice
service is unavailable`.
- **Migration** is `20260918007000_add_stage_channels`, not `20260918000000`: later `20260918*`
  migrations were already applied locally. Both tables also got a `userId` index for the per-user
  cleanup.
- **Server owner** is written into `StageSpeaker` when they join, so every client's roster shows
  them as a speaker; if they step down and rejoin, they are a speaker again.
- **Stage events reach two rooms.** `stage:role-changed` and `stage:speak-request-updated` go to
  `call:<channelId>` **and** `channel:<channelId>`. With the call room only, a member who opened the
  stage before someone was promoted joined with a stale roster (found in the browser pass). The
  channel room is joined only after the `ViewChannel` check, and `GET .../stage` already shows the
  same data to any viewer.
- **Status codes.** Promoting a user who lacks `SPEAK_VOICE` → `400 Member cannot speak in this
channel` (the API table's `400`, not the `403` in the Rules prose); promoting a non-member → `404
Member not found`; requesting while already a speaker → `400 Already a stage speaker`. `GET
.../stage` also returns `canModerate` so the client knows whether to show moderator controls.
- **`CONNECT_VOICE` is not checked on join.** A stage join is authorized exactly like every other
  call (`RealtimeAccessService.authorizeCallJoin`: server membership plus rules screening), which has
  never read `CONNECT_VOICE`. Enforcing it only for stages would make stages stricter than voice
  calls; enforcing it for all calls is a behavior change outside this doc. Acceptance criterion 2 is
  left unchecked for that reason.
- **Mesh refusal.** `voice:join` on a stage while `VOICE_TRANSPORT=mesh` answers `503 Stage channels
need the LiveKit voice transport`.
- **No text chat.** Sending or scheduling a message in a `STAGE` channel is refused with `400 Stage
channels have no text chat` (`messages.service.ts` `requireCanPostInChannel`,
  `scheduled-messages.service.ts`), matching Out of scope.
- **Other touch points not listed in Files:** `CreateChannelDto` accepts `STAGE`; server templates
  keep `STAGE` channels (`server-template.rules.ts`); account anonymization deletes the user's stage
  rows (`account-anonymization.ts`), because the anonymized `User` row is kept and the cascade does
  not fire; the web role editor lists `MUTE_MEMBERS` (`helpers.ts` `PERMISSION_VALUES`), without which
  no role could be given the moderator permission from the UI.
- **Web.** `components/stage/StageChannelView.tsx` replaces the message list and composer (like the
  forum view), with `StageModeratorQueue.tsx` for holders of `MUTE_MEMBERS`; roster data comes from
  `hooks/useStageRoster.ts`. Speakers publish their microphone only (no camera in this version). The
  client follows LiveKit's own `ParticipantPermissionsChanged` event to start or stop publishing,
  not the socket event, so it never tries to publish before the grant arrives. The stage is created
  from the server menu ("Create stage channel"), and header call buttons are hidden on a stage.
- **Voluntary leave** (open question 30): confirmed there is no leave-server endpoint in
  `apps/api/src` — `serverMember` rows are deleted only by kick, ban, bot removal and account
  anonymization — so kick, ban and anonymization are the complete cleanup set today.
- **Verification (2026-09-18, local LiveKit, headless Chrome with fake media):** API — 30/30
  scenarios (roles on join and token grants, request/withdraw, 403 for a non-moderator, 400 without
  `SPEAK_VOICE`, 404 for a non-member, promote/demote/step-down with live events, audit rows, 400
  for text messages, no `webrtc:*` relay, kick and ban cleanup with broadcasts). Browser — 12/12:
  owner joins and publishes, audience connects with no tracks and `canPublish: false` and hears the
  owner, request → moderator approves → the same LiveKit session starts publishing (same participant
  sid, no reconnect), moderator removes → tracks unpublished and `canPublish: false` in the same
  session, UI switches back, no horizontal overflow at 390x844. Not verified: a kicked speaker's
  client in the browser (the API side is covered), and more than 3 clients.

## Risks & Rollback

- **Hard dependency on `voice-sfu.md` being implemented first**: this doc cannot ship on the current mesh architecture at all — there is no per-participant publish/subscribe control in `useChannelCall.ts` today (every peer connection is symmetric). Shipping any part of this doc before LiveKit lands is not possible without inventing a parallel, throwaway media-gating mechanism, which this doc deliberately does not do.
- **Risk**: `SPEAK_VOICE`'s dual meaning (ordinary voice channel vs. stage-eligibility) noted above could confuse role configuration — accepted per the 2026-09-18 decision, not re-opened here.
- **Risk**: the kick/ban cleanup in Changes §7 depends on locating and confirming `server-moderation.service.ts`'s exact socket-disconnection behavior for a banned/kicked member's active LiveKit session — this doc specifies the required DB cleanup precisely, but the "also force-disconnect an active speaker's publish session" half needs verification against the real disconnection mechanism at implementation time, not assumed here.
- **Risk**: no voluntary "leave server" endpoint was located to attach the same cleanup to (Current Behavior) — if one exists, it needs the same `StageSpeaker`/`StageSpeakRequest` cleanup added; flagged in `open-questions.md` rather than assumed either way.
- **Risk**: adding `MuteMembers` to `channel-permission.ts`'s `Permission` const is a small but real change to a shared permission-checking module used by every other channel-permission call site in the API — it is additive (a new const key) and should not change behavior for any existing check, but it is listed here because it is a dependency this doc's own moderator-check code cannot compile without.
- **Rollback**: revert code; the migration is additive (new enum value, two new tables) and safe to drop. The `Permission.MuteMembers` const addition is also safe to revert as long as no other shipped code has started depending on it.

## Test Plan

**Automated**: none — `RULE.md` forbids `*.test.ts`/`*.spec.ts` files. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check` (once `voice-sfu.md`'s dependency is actually implemented and buildable).

**Manual** (post-LiveKit, using the same 2-3 fake-media Chrome client setup as `voice-sfu.md`'s Test Plan: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`):

1. Owner creates a `STAGE` channel; member A joins (fake-media client) → sees audience view, no mic/camera capture starts, no publish grant; confirm via `chrome://webrtc-internals` that no outbound audio/video track is sent.
2. A requests to speak → moderator (a second client, holding `MUTE_MEMBERS`) sees the request in the queue → approves → A's client transitions to speaker view and their microphone activates; `stage:role-changed` reaches a third open client live without that client refetching.
3. Moderator removes A from the stage → A's client drops to audience view without leaving the call (`voice:leave` is not triggered, confirmed by `CallRegistryService` still listing A as a participant); A's mic capture stops and the LiveKit connection stays open (no reconnect observed in `chrome://webrtc-internals`).
4. **Failure case**: a non-moderator member calls `POST /channels/:channelId/stage/speakers` for another user → `403`.
5. **Failure case**: a moderator tries to promote a user who lacks `SPEAK_VOICE` on the channel (e.g. denied via a channel override) → `400`.
6. **Failure case — kick with an active speaker slot**: while A is an active speaker, a moderator with `KICK_MEMBERS` kicks A from the server → A's `StageSpeaker` row is gone (`GET .../stage` no longer lists A), and A's client either loses its publish grant immediately or is disconnected entirely (record which behavior the implementation actually produces, since Risks flags this as unverified against the real disconnection mechanism).

## Deployment Notes

- Ships only after `voice-sfu.md` is implemented and deployed — same ordering dependency `voice-sfu.md` itself has on `realtime-scale-out.md`.
- Run migration `20260918000000_add_stage_channels` before deploying the API.
- No new env vars beyond what `voice-sfu.md` already introduces (`LIVEKIT_URL`, `LIVEKIT_WS_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`); this doc reuses the same `RoomServiceClient` configuration.
- New `stage.*` i18n keys land in both `en` and `vi` catalogs in the same change.
- Breaking-change risk: none to existing `VOICE`/`TEXT`/`FORUM` channel behavior — `STAGE` is additive; existing `voice:join` callers on non-stage channels see no shape change beyond the new optional `stageRole` field being absent/undefined.
