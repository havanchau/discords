# Feature Spec: Stage Channels

A `STAGE` channel type for one-to-many audio: a small set of speakers publish audio/video, everyone else joins as silent audience, and moderators manage who can speak.

**Depends on**: [`voice-sfu.md`](./voice-sfu.md) — stage channels need per-participant publish/subscribe control (an audience member must be able to join a call without ever uploading media, and a speaker's publish rights must be revocable mid-call), which the current full-mesh `RTCPeerConnection`-per-peer model (`apps/web/src/hooks/useChannelCall.ts`) has no mechanism for: every mesh participant is already a full publisher/subscriber to every other participant by construction. `voice-sfu.md` is itself an unimplemented design doc as of this writing (no SFU code exists in the repo — see its Current Behavior section); this doc cannot ship before that one does.

## Goal

A `STAGE` channel holds a large audience that joins muted-by-default with no publish rights, plus a small set of speakers who can publish audio/video; a member can "request to speak," and a moderator (`MUTE_MEMBERS`-equivalent stage permission) invites or removes speakers.

**Acceptance criteria**:

- `voice:join` on a `STAGE` channel returns the caller's role in the stage (`audience` or `speaker`) alongside the existing `{ participants }` shape; the SFU access token minted for the caller (per `voice-sfu.md`'s Changes §2) grants **subscribe-only** rights for `audience` and **publish+subscribe** for `speaker`.
- Any member with `CONNECT_VOICE` can join a stage as audience; only the channel owner-invited speakers, and the server owner/stage moderators, join as speakers directly.
- An audience member can send a "request to speak"; a stage moderator can approve (promoting to speaker) or the member can be invited directly without requesting.
- A stage moderator can move a speaker back to audience ("remove from stage"), which revokes their SFU publish token without disconnecting their call.
- Existing `voice:state`, `voice:active`, `voice:leave` contracts continue to work unchanged for stage participants (per `voice-sfu.md`'s stability goal).
- A non-moderator cannot self-promote to speaker by any client-side action — the SFU only issues a publish-capable token when the server-side role check passes.

## Scope

**In scope**

- `STAGE` channel type, per-participant stage role (`audience` | `speaker`) tracked alongside the existing `CallParticipant` bookkeeping, request-to-speak, moderator invite/approve/remove-from-stage actions, SFU token scoping (publish vs. subscribe-only) per `voice-sfu.md`'s token-issuance point.
- Stage UI: audience view (listen-only, raised-hand button), speaker view (existing call controls), moderator controls (speaker queue, invite/remove).

**Out of scope**

- Scheduled stages / stage topics and start times (could later reuse `docs/features/server-events.md`'s event model, not designed here).
- Recording a stage.
- Text chat inside a stage channel (a stage is audio/video-only; this doc does not add a `STAGE` variant of channel messaging).
- Stage discovery/browsing across servers.
- Multiple concurrent "sub-stages" or breakout rooms.

## Current Behavior

- `ChannelType` is `TEXT | VOICE` (`apps/api/prisma/schema.prisma:18-21`); no stage/broadcast concept exists.
- `voice:join` (`apps/api/src/modules/realtime/voice.gateway.ts:32-68`) treats every joiner identically: it calls `access.authorizeCallJoin(user.id, body.channelId)` (line 46, checks membership only via `requireChannelMember`, `realtime-access.service.ts:33-40`), builds a `CallParticipant` (line ~50), joins the `call:<channelId>` room, and returns `{ participants: existingParticipants }`. Every participant in a call today is symmetric — a full publisher and subscriber to every peer, by construction of the mesh (`apps/web/src/hooks/useChannelCall.ts:32`, one `RTCPeerConnection` per remote peer).
- `CallParticipant` (`apps/api/src/modules/realtime/call-registry.service.ts:6-15`) has `mode: 'voice'|'video'|'screen'`, `isMuted`, `isCameraOff`, `isSharingScreen` — no field for "can this participant publish media at all."
- `SPEAK_VOICE` and `CONNECT_VOICE` already exist as channel-scoped permissions (`packages/shared/src/permissions.ts:10,12`; also independently defined in `apps/api/src/modules/permissions/channel-permission.ts:11-12`) and already flow through `ChannelPermissionOverride` per-channel/per-role/per-member grants (`evaluateChannelPermission`, `channel-permission.ts:44-76`) — today they gate joining/speaking in an ordinary `VOICE` channel uniformly (no server code currently reads `SPEAK_VOICE` to differentiate within a single call; confirmed no call site references it outside the permission list/editor — see grep above, all hits are the permission catalog and its label, not an enforcement call site). This doc is the first thing to actually enforce `SPEAK_VOICE` as a runtime gate.
- `voice-sfu.md`'s Changes §2 describes `voice:join` minting an SFU access token after `authorizeCallJoin` succeeds — that token-issuance point is what this doc scopes to publish-vs-subscribe.

## Changes

### Rules

- `STAGE` is a new `ChannelType`. A `STAGE` channel's `CONNECT_VOICE` permission (existing) governs who may join at all (as audience, at minimum); a new `SPEAK_VOICE`-on-stage check governs who joins with publish rights.
- Joining a `STAGE` channel: `voice:join` calls `access.authorizeCallJoin` exactly as today, then (new, stage-only) computes the caller's stage role: `speaker` if they hold `SPEAK_VOICE` via `ChannelPermissionOverride`/role on that channel **and** are in the channel's current `StageSpeaker` set (see Data model), else `audience`. A member is never a speaker by permission alone — permission only allows a moderator to _add_ them to the speaker set; being an audience member is otherwise the default regardless of role.
- Stage moderators are members holding `MUTE_MEMBERS` (reused — no new server-level permission, matching the repo's pattern of reusing an existing close-enough permission before adding a new one, as `server-events.md` did with `MANAGE_SERVER`) on the channel's server.
- `POST /channels/:channelId/stage/request-to-speak`: audience member adds themselves to a `StageSpeakRequest` queue; idempotent if already requested; rejected (`400`) if the caller is already a speaker.
- `POST /channels/:channelId/stage/speakers`: moderator-only, `{ userId }`, adds to the `StageSpeaker` set (consuming any pending request for that user) and emits a role-change event so the caller's SFU token is reissued with publish rights.
- `DELETE /channels/:channelId/stage/speakers/:userId`: moderator-only, removes from `StageSpeaker`, emits the same event so the token is reissued subscribe-only. Removing yourself (a speaker stepping down) is allowed without the moderator permission.
- A speaker who is later removed **stays connected to the call** (per acceptance criteria) — this mirrors `voice-sfu.md`'s general principle that call membership (`CallRegistryService`) is separate bookkeeping from media transport; only the token's publish grant changes.
- Audit: `STAGE_SPEAKER_ADD` / `STAGE_SPEAKER_REMOVE` `{ userId }`, following the existing audit-action-string convention (`servers.service.ts`'s `writeAuditLog` calls).

### Edge cases

| Case                                                               | Expected behavior                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience member tries to publish media directly (bypassing the UI) | SFU rejects the publish because the subscribe-only token grants no publish capability — enforced server-side at token mint, not just hidden in the client UI, per `RULE.md`'s "hiding a button is not authorization." |
| Last speaker leaves the stage                                      | Stage continues with zero speakers; audience stays connected, listening to silence — no auto-promotion happens (out of scope: picking a new speaker automatically).                                                   |
| Moderator removes a speaker who never requested (invited directly) | Same removal path; no dependency on a prior request row existing.                                                                                                                                                     |
| Member leaves the server while a pending speak request exists      | `voice:leave` / membership removal paths are unaffected; a stale request for a departed member is simply never actioned (no cleanup job specified — flagged in Risks).                                                |

## Technical Approach

### Data model

```prisma
enum ChannelType {
  TEXT
  VOICE
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

Migration `<timestamp>_add_stage_channels`. Both tables are keyed by `(channelId, userId)`, not by a call session, so they represent "current stage roster," not call history — consistent with `CallRegistryService` also being in-memory/ephemeral call state rather than persisted per-session rows.

### API

| Method   | Path                                          | Body         | Response                                               |
| -------- | --------------------------------------------- | ------------ | ------------------------------------------------------ |
| `POST`   | `/channels/:channelId/stage/request-to-speak` | —            | `{ ok: true }`                                         |
| `DELETE` | `/channels/:channelId/stage/request-to-speak` | —            | `{ ok: true }` (withdraw own request)                  |
| `GET`    | `/channels/:channelId/stage`                  | —            | `{ speakers: StageMember[], requests: StageMember[] }` |
| `POST`   | `/channels/:channelId/stage/speakers`         | `{ userId }` | `{ ok: true }`                                         |
| `DELETE` | `/channels/:channelId/stage/speakers/:userId` | —            | `{ ok: true }`                                         |

### Realtime

- `voice:join` (unchanged event name) response gains `stageRole: 'audience' | 'speaker'` for `STAGE` channels, alongside whatever SFU token field `voice-sfu.md` introduces — additive, so `voice-sfu.md`'s stability goal for the event contract holds.
- New event `stage:role-changed` `{ channelId, userId, role }` emitted to `call:<channelId>` whenever the speaker set changes (add/remove), so open clients reissue their SFU subscription/publish state without leaving and rejoining the call — this is the client-facing signal that triggers the token-reissue step, since the SFU integration itself is out of this doc's scope to design (owned by `voice-sfu.md`).
- New event `stage:speak-request-updated` `{ channelId, userId, requested }` to the `call:<channelId>` room, for the moderator's live speaker-queue UI.

### Files

- API: `apps/api/prisma/schema.prisma`, new migration, new `apps/api/src/modules/realtime/stage.service.ts` (speaker set, request queue, permission checks — separate from `CallRegistryService` per its existing "membership/state, not media" boundary), `apps/api/src/modules/realtime/voice.gateway.ts` (`voice:join` computes and returns `stageRole`; new `stage:*` socket handlers or a REST controller — REST fits better here since these are moderator actions, not high-frequency signaling, matching the existing REST-for-CRUD / socket-for-live-broadcast split the repo already uses for e.g. bans vs. `server:member-removed`), new `apps/api/src/modules/channels/dto/stage-speaker.dto.ts`.
- Web: `apps/web/src/api.ts`, `apps/web/src/hooks/useChannelCall.ts` (branches on `stageRole` to skip local media capture entirely for audience, per `voice-sfu.md`'s note that media capture logic is otherwise unchanged), new `apps/web/src/components/stage/StageAudienceView.tsx`, `StageSpeakerControls.tsx`, `StageModeratorPanel.tsx`, `apps/web/src/components/workspace/ChannelSidebar.tsx` (new icon branch, mirroring the `VOICE` branch at line 92), `apps/web/src/i18n/locales/en.ts` / `vi.ts`.

## Trade-offs

| Option                                                                                                   | Pros                                                                                                                                                                                                                               | Cons                                                                                                                                                                                                                                                                                                               | Verdict                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New `STAGE` channel type vs. a "stage mode" flag on `VOICE` channels                                     | A flag is a smaller migration (one boolean instead of an enum value)                                                                                                                                                               | Blurs two genuinely different UIs (full-mesh-style symmetric call vs. broadcast) under one type, and the sidebar/UI already branches on `ChannelType` (`ChannelSidebar.tsx:92`) — a type is the more consistent extension point, matching how `forum-channels.md` also adds a new `ChannelType` rather than a flag | **Chosen**: new `ChannelType` value, consistent with the repo's existing type-based branching                                                                                           |
| Reuse `SPEAK_VOICE` + a speaker-set table vs. a brand-new `STAGE_MODERATE`/`STAGE_SPEAK` permission pair | Avoids adding permissions that existing roles would silently lack (same reasoning `server-events.md` used for `MANAGE_SERVER`); `SPEAK_VOICE` already exists and is unused at runtime today, so this is its first real enforcement | `SPEAK_VOICE` was originally scoped as "can speak in this voice channel," a slightly different meaning than "eligible to be granted a stage speaker slot" — conflating the two could surprise an admin who granted `SPEAK_VOICE` broadly expecting only ordinary voice-channel behavior                            | **Chosen**, with the caveat flagged in Risks — the alternative (a new permission) is cleaner semantically but adds permission-catalog churn for a first version                         |
| REST endpoints for stage moderation vs. socket events                                                    | Matches the existing split: moderation actions with audit trails go through REST controllers (bans, kicks, timeouts), while `voice.gateway.ts` handles only high-frequency call signaling                                          | A REST-only path means moderator UI needs a manual refetch or the new `stage:*` broadcast events to stay live, adding two new socket events anyway                                                                                                                                                                 | **Chosen** REST for the mutating actions plus broadcast events for live sync, mirroring `member-bans.md`'s pattern (`POST /servers/:serverId/bans` + `server:member-removed` broadcast) |

## Risks & Rollback

- **Hard dependency on `voice-sfu.md` being implemented first**: this doc cannot ship on the current mesh architecture at all — there is no per-participant publish/subscribe control in `useChannelCall.ts` today (every peer connection is symmetric). Shipping any part of this doc before the SFU lands is not possible without inventing a parallel, throwaway media-gating mechanism, which this doc deliberately does not do.
- **Risk**: `SPEAK_VOICE`'s dual meaning (ordinary voice channel vs. stage-eligibility) noted above could confuse role configuration; flagged in `open-questions.md` for a product decision on whether stages need their own permission.
- **Risk**: a stale `StageSpeakRequest` for a member who left has no defined cleanup path (edge case table above) — left as an open question rather than inventing a TTL/cron job unilaterally.
- **Rollback**: revert code; the migration is additive (new enum value, two new tables) and safe to drop.

## Test Plan

- **Automated**: none — `RULE.md` forbids `*.test.ts`/`*.spec.ts` files. Verify with `npm run typecheck`, `npm run lint`, `npm run build` (once `voice-sfu.md`'s dependency is actually implemented and buildable).
- **Manual** (post-SFU):
  1. Owner creates a `STAGE` channel; member A joins → sees audience view, no mic/camera capture starts, no publish token.
  2. A requests to speak → moderator sees the request in the queue → approves → A's client transitions to speaker view and their microphone activates; `stage:role-changed` reaches other open clients live.
  3. Moderator removes A from the stage → A's client drops to audience view without leaving the call (`voice:leave` is not triggered); A's mic capture stops.
  4. Failure case: a non-moderator member calls `POST /channels/:channelId/stage/speakers` for another user → `403`.

## Deployment Notes

- Ships only after `voice-sfu.md` is implemented and deployed — same ordering dependency `voice-sfu.md` itself has on `realtime-scale-out.md`.
- Run the new migration before deploying the API.
- New `stage.*` i18n keys land in both `en` and `vi` catalogs in the same change.
- Breaking-change risk: none to existing `VOICE`/`TEXT` channel behavior — `STAGE` is additive; existing `voice:join` callers on non-stage channels see no shape change beyond the new optional `stageRole` field being absent/undefined.
