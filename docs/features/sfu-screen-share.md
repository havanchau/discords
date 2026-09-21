# Feature Spec: Screen Share Across Call Transports

Extends screen sharing — today only reachable from a server voice/video channel's header — to direct-message calls (1-1 and group), and closes two small usability gaps (mobile capability detection, cropped shared-screen rendering) that apply to every transport.

**Depends on / related**: [`voice-sfu.md`](./voice-sfu.md), [`voice-webrtc.md`](./voice-webrtc.md) (call media transport), [`dm-calls.md`](./dm-calls.md) (DM ringing protocol this doc extends), [`stage-channels.md`](./stage-channels.md) (explains why stage speakers publish audio-only today).

**Status**: draft — awaiting review

## Goal

Screen sharing already works end-to-end on both call media transports for server voice/video channels (see Current behavior) — the starting assumption that it needed enabling on the LiveKit path was checked against the code and is **not correct**: `apps/web/src/hooks/livekitCall.ts:65-77` already tags a shared-screen track with `Track.Source.ScreenShare`/`ScreenShareAudio` and publishes it exactly like the mesh path renegotiates one. What is missing is reach and polish: DM and group DM calls have no way to share a screen at all, the share button is offered even where the browser cannot support it, and a shared screen renders cropped like a webcam tile instead of scaled to fit.

**Acceptance criteria**:

- [ ] A 1-1 or group DM call can be started, or switched into, screen-share mode the same way a server voice channel call can; the existing ring/accept/decline protocol carries the new mode.
- [ ] The "Share screen" action is hidden (not just failing at runtime) in any browser context where `navigator.mediaDevices.getDisplayMedia` does not exist (mobile web).
- [ ] A shared screen tile is rendered with `object-fit: contain` so on-screen text is not cropped, on both the local preview and remote tiles.
- [ ] No change to server voice/video channel screen sharing, mesh vs. LiveKit selection, or stage channels — all out of scope, see Scope.

## Scope

**In scope**

- Widening the DM call ring protocol and the web DM call UI to offer and carry a `'screen'` mode, reusing the `useChannelCall` plumbing already shared between server calls and DM calls (`call.startDirectCall` → `startCall`, unchanged).
- Hiding the screen-share action where `getDisplayMedia` is not available (server voice header, DM header).
- Switching the screen-share tile's CSS from `object-fit: cover` to `object-fit: contain`.

**Out of scope** (spell out so it does not read as an oversight)

- Sharing a screen **while remaining** in an ongoing voice/video call (simultaneous mic + screen, or camera + screen). Today "screen" is one of three mutually exclusive call-start modes (`apps/web/src/helpers.ts:27`); joining as `screen` captures only `getDisplayMedia({ video: true, audio: true })` (`apps/web/src/hooks/useChannelCall.ts:166-167`) and never also captures the microphone. Turning this into an add-on track alongside an existing call is a materially bigger change (multi-track renegotiation on the mesh path, a second published track and a second UI tile on both paths) and is tracked as an open question, not designed here.
- Stage channels. A stage speaker's only capture path is hardcoded to `getUserMedia({ audio: true, video: false })` (`apps/web/src/hooks/useChannelCall.ts:356`), and `StageChannelView.tsx` has no share action at all. `stage-channels.md`'s own deviation note ("speakers publish their microphone only, no camera in this version") is the precedent for leaving stage screen share for a later doc; see `open-questions.md`.
- LiveKit publish-quality tuning for screen content (`contentHint`, screen-share-specific encoding presets) — none exists today (grepped `apps/web/src/hooks/livekitCall.ts`, `apps/web/src/hooks/useChannelCall.ts` for `VideoPreset`/`contentHint`/`simulcast`: no matches). Flagged as a follow-up, not designed here — it needs real bandwidth/legibility measurement first, per `rules/performance.md`.
- A dedicated "who can screen-share" permission. No such permission exists for any call mode today (see Current behavior); adding one is a call-wide authorization change, not a screen-share-specific gap, and is out of scope here.
- Pinned/focused/full-size view for whoever is sharing. Every call tile — local, remote, screen or camera — is an equal-size cell in the same CSS grid (`apps/web/src/components/chat/CallStage.module.css:111-115`); giving the active share a larger, click-to-focus tile is a real UX improvement but is a bigger layout change than this doc's scope.

## Current behavior

**Current-behavior matrix** (verified by reading the code; "n/a" = the concept does not apply)

| Call type | Can start a screen share today? | Track published as | Rendered by receivers | Who is authorized | Browser "Stop sharing" |
|---|---|---|---|---|---|
| Mesh voice/video channel | Yes — `mode: 'screen'` at call start | One `RTCPeerConnection.addTrack` per captured track, added when the peer connection is created (`apps/web/src/hooks/useChannelCall.ts:389-394`); no `replaceTrack` anywhere in the codebase (grepped) | `RemoteVideoTile.tsx` — generic tile, `object-fit: cover`, "Sharing screen" text label (`RemoteVideoTile.tsx:38-39`) | Same as joining any voice call: server membership only (`RealtimeAccessService.authorizeCallJoin`, `realtime-access.service.ts:92-104`) — no `CONNECT_VOICE`/`SPEAK_VOICE` check, no screen-specific permission | Ends the whole call (`track.onended` calls `endCall()`, `useChannelCall.ts:181-186`) — there is no camera/mic fallback to revert to, since a screen-mode call never captured them |
| LiveKit voice/video channel | Yes — same `mode: 'screen'` path | `room.localParticipant.publishTrack(track, { source: Track.Source.ScreenShare / ScreenShareAudio })` (`livekitCall.ts:65-77`); LiveKit access-token grant has `canPublish: true` and no `canPublishSources` restriction for a non-stage join (`voice.gateway.ts:89` — `canPublish: stageRole !== 'audience'`, `livekit.service.ts:74-80` sets no source restriction) | Same `RemoteVideoTile.tsx`, fed by `RoomEvent.TrackSubscribed` (`livekitCall.ts:48-49`) | Same as mesh — `authorizeCallJoin` only, transport-independent | Same `track.onended` → `endCall()`; LiveKit path also disconnects the room (`useChannelCall.ts:252-254`) |
| Stage channel | No | n/a | n/a | A speaker's LiveKit grant is `canPublish: true` with no source restriction, so nothing at the LiveKit layer would refuse a screen track — but no client code ever offers one: `applyStagePublishRight` only ever calls `getUserMedia({ audio: true, video: false })` (`useChannelCall.ts:354-362`), and `StageChannelView.tsx` has no share button | Audience has `canPublish: false` outright (`voice.gateway.ts:89`); a moderator can promote to speaker but speaker capture is hardcoded audio-only | n/a |
| 1-1 DM call | No | n/a | n/a | n/a | n/a |
| Group DM call | No | n/a | n/a | n/a | n/a |

**Why DM calls have no screen share, in detail**:

- The DM ring protocol's mode is a closed union that excludes it: `DmCallMode = 'voice' | 'video'` is declared independently in two places — `apps/api/src/modules/realtime/dm-call-rings.ts:3` (server) and `apps/web/src/hooks/useDirectCall.ts:9` (client) — neither imports a shared type from `packages/shared`.
- `VoiceGateway.ringDirectCall` rejects anything else explicitly: `if (body.mode !== 'voice' && body.mode !== 'video') throw new UnauthorizedException('Invalid call mode')` (`apps/api/src/modules/realtime/voice.gateway.ts:129-131`).
- The DM header only renders two call buttons: `(['voice', 'video'] as const).map(...)` (`apps/web/src/components/home/HomeDirectMessageView.tsx:153-171`).
- `IncomingCallDialog` only branches on `isVideo = incomingCall?.mode === 'video'` (`apps/web/src/components/home/IncomingCallDialog.tsx:24`) for its title and icon — a binary switch, not a three-way one.
- Underneath, DM calls already reuse `useChannelCall`'s generic `startCall(mode, { callId: 'dm:<id>' })` (`useDirectCall.ts:110`, `138`), which already accepts `CallMode` including `'screen'` (`useChannelCall.ts:155`) — the plumbing that makes screen share work for server calls already runs under every DM call too. The gap is entirely in the DM-specific type/UI/ring layer above it, not in call media handling.

**Why the share button has no capability check**: `getDisplayMedia` is called unconditionally at `useChannelCall.ts:167` inside a `try`; on a browser/device where `navigator.mediaDevices.getDisplayMedia` does not exist, calling it throws, which is caught and surfaced as `t('error.fallback.cannot-start-call')` (`useChannelCall.ts:238-241`). The button is always rendered regardless of device (`ChatHeader.tsx`'s `callActions` array at lines 73-95 includes `'screen'` unconditionally; `isNarrow` only moves it into the overflow menu, `ChatHeader.tsx:100-103`) — grepped the whole web app for `getDisplayMedia`: the one call site above is the only one, so there is no existing feature-detection helper to reuse.

**i18n**: the copy already exists in both catalogs for the parts that already ship — `call.screenShare`, `call.sharingScreen`, `call.userSharingScreen`, `call.joinStream`, `chatHeader.shareScreen` (`apps/web/src/i18n/locales/en/chat.ts:14,20,21,23,41` and the matching `vi/chat.ts` keys) — new keys are only needed for the DM-specific strings this doc adds (Changes → i18n).

## Changes

### Rules / Flow

1. `DmCallMode` (both declarations) widens from `'voice' | 'video'` to `'voice' | 'video' | 'screen'`. `VoiceGateway.ringDirectCall`'s inline validation (`voice.gateway.ts:129`) accepts `'screen'` alongside the existing two values; no other server-side branch reads `DmCallMode` beyond passing it through to `DmCallRings`/notifications (`dm-calls.service.ts:61-77`, `149-166`), so no further server logic changes.
2. The DM header (`HomeDirectMessageView.tsx:153-171`) gains a third call button for `'screen'`, matching `ChatHeader.tsx`'s pattern (icon `MonitorUp`, `chatHeader.shareScreen` label) — offered for both 1-1 and group DM conversations, since nothing in `DmCallsService.ring`/`authorizeCall` (`dm-calls.service.ts:42-59`) distinguishes call modes by conversation type.
3. `IncomingCallDialog` (`IncomingCallDialog.tsx:24,29,58`) changes its binary `isVideo` branch to a three-way switch on `incomingCall.mode` (`'voice' | 'video' | 'screen'`), each with its own title copy and icon (`MonitorUp` for screen), matching the pattern `CallStage.tsx:35-41` already uses for the active-call banner.
4. `useDirectCall.startDirectCall`/`acceptIncomingCall` need no change: both already pass `mode` through untyped-generically to `startCall`, which already handles `'screen'` (`useDirectCall.ts:103-131`, `133-142`).
5. Mobile/unsupported-capability hiding: a small helper (`canShareScreen(): boolean`, checking `typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)`) gates the `'screen'` entry out of both `ChatHeader.tsx`'s `callActions` array and the new DM header button list, computed once (not per render) since capability does not change during a session.
6. `object-fit: cover` → `object-fit: contain` for the screen-sharing case only: `CallStage.module.css:127-132`'s `.callTile video` and `RemoteVideoTile.module.css:11-16`'s `.tile video` both gain a screen-specific class (`.screenShareVideo` or similar) applied when `state.isSharingScreen` / `participant.isSharingScreen` is true, so camera/mic tiles keep the existing `cover` crop (which reads better for faces) and only the screen tile switches to `contain` (so on-screen text is not cropped). Background remains `var(--surface-sunken)` to fill the now-visible letterboxing.

### Edge cases

| Case | Expected behavior |
|---|---|
| Group DM call, one member shares their screen | Same as a group voice/video DM call today: every other member's `RemoteVideoTile` shows that participant's screen, "Sharing screen" label, `contain`-fit. No change to the existing "one active call per client" rule (`dm-calls.md`'s Trade-offs) — a member cannot also be in a channel call at the same time. |
| Recipient's browser cannot render the incoming call as `screen` (e.g. an older client build) | Out of scope — this doc does not add a client-version negotiation; `IncomingCallDialog`'s fallback for an unrecognized mode is the existing default branch behavior of a plain if/else chain, which the implementer should audit at build time, not something this doc designs. |
| Caller's browser lacks `getDisplayMedia` (mobile) | The share button is not shown at all (Rules item 5); `dm:call:ring` with `mode: 'screen'` from a client that never should have offered it is still server-side accepted (the gateway does not distinguish device capability) — this is acceptable since the button gating is the actual control point, matching how the repo already treats client-side capability gating as a UX concern, not a security boundary, for every other call mode. |
| Declining or missing a `'screen'` DM call | Identical to voice/video — `DmCallsService` does not branch on `mode` for decline/cancel/expiry (`dm-calls.service.ts:79-139`); the missed-call notification title interpolates `ring.mode` directly (`dm-calls.service.ts:162`, `` `Missed ${ring.mode} call from ...` ``) and will read "Missed screen call from X" — a pre-existing hardcoded-English string, unchanged by this doc, not fixed here (out of scope: no other notification title in this file goes through i18n either). |
| Screen-share DM call ends via the browser's native "Stop sharing" control | Same as today's server-channel behavior: `track.onended` ends the whole call (`useChannelCall.ts:181-186`) — there is no mic/camera to fall back to, consistent across every call type after this change. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/src/modules/realtime/dm-call-rings.ts` | `DmCallMode` → `'voice' \| 'video' \| 'screen'`. |
| `apps/api/src/modules/realtime/voice.gateway.ts` | `ringDirectCall`'s mode validation accepts `'screen'`. |
| `apps/web/src/hooks/useDirectCall.ts` | `DirectCallMode` → `'voice' \| 'video' \| 'screen'`. |
| `apps/web/src/components/home/HomeDirectMessageView.tsx` | Add the `'screen'` call button (gated by `canShareScreen()`), matching `ChatHeader.tsx`'s icon/label pattern. |
| `apps/web/src/components/home/IncomingCallDialog.tsx` | Three-way title/icon switch instead of `isVideo`. |
| `apps/web/src/components/chat/ChatHeader.tsx` | Gate the existing `'screen'` entry in `callActions` behind `canShareScreen()`. |
| `apps/web/src/utils/mediaCapabilities.ts` (new) | `canShareScreen()` helper, single source of truth for both headers. |
| `apps/web/src/components/chat/CallStage.module.css`, `CallStage.tsx` | Screen-share tile class, `object-fit: contain`. |
| `apps/web/src/components/RemoteVideoTile.module.css`, `RemoteVideoTile.tsx` | Same. |
| `apps/web/src/i18n/locales/en/chat.ts`, `vi/chat.ts` | New keys: `call.incomingScreenShare` (or equivalent three-way incoming-call title), `dm.startScreenShare`/reuse of `chatHeader.shareScreen` for the DM button label. |

**API contract**

- `dm:call:ring` (socket event, unchanged path `apps/api/src/modules/realtime/voice.gateway.ts:121-137`): request payload `{ conversationId: string; mode: 'voice' | 'video' | 'screen' }` (was `'voice' | 'video'`). Response ack unchanged: `{ ok: true }` or `{ error: string }` via `HttpException` → `socketErrors.ack`.
- `dm:call:incoming` (server → recipients): `{ conversationId, mode, caller }` — `mode` now can be `'screen'`. No other event payload changes (`voice:join`, `voice:state` already carry `mode: 'voice' | 'video' | 'screen'`, unchanged — `call-registry.service.ts:11`).
- No REST endpoint changes. No changes to `packages/shared/src/api-contract.ts` — `DmCallMode` is not defined there today (it is duplicated between API and web, per Current behavior) and this doc keeps that existing duplication rather than introducing a new shared-package export as an unrelated refactor; both declarations are widened identically.

**Libraries** — none new; reuses `livekit-client`'s existing `Track.Source.ScreenShare`/`ScreenShareAudio` handling and the repo's own `lucide-react` `MonitorUp` icon (already imported in `ChatHeader.tsx:8`).

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): widen the existing `mode` enum end-to-end (DM ring protocol + UI)** | Reuses 100% of the already-working call media path (`useChannelCall`, both transports); the DM ring protocol already threads an arbitrary `mode` string through with no mode-specific server logic (Current behavior), so the server change is a one-line type widening plus a validation-list update | The DM call and channel call UIs keep two independently-maintained `callActions`-shaped button lists (`ChatHeader.tsx` and `HomeDirectMessageView.tsx`) rather than one shared component — pre-existing duplication, not introduced by this doc | **Chosen** — matches the "reuse existing patterns" rule; a shared call-button component is a separate, unrelated refactor |
| B: add a dedicated `dm:call:share-screen` event instead of widening `mode` | Keeps `voice`/`video` semantically distinct from a mid-call action | Screen share is not a mid-call action here (Out of scope) — it is a call-start mode, exactly like `voice`/`video` already are; a new event would duplicate the entire ring/accept/decline state machine for no behavioral difference | Rejected — the existing `mode` enum is already the right shape for a call-start choice |
| C: also add simultaneous mic+screen and mid-call "start sharing" now | Closes the biggest real usability gap in one pass | Requires multi-track renegotiation on the mesh path (today one `RTCPeerConnection` per peer is built once at join with whatever `localStreamRef` holds at that instant — `useChannelCall.ts:381-394` — never renegotiated afterward) and a second published track plus a second UI tile per participant on both transports; this is a call-architecture change, not a screen-share-reach change, and does not fit this doc's proportional scope | Rejected for this doc — recorded as an open question for a follow-up doc |
| D: leave stage channels out (chosen) vs. add stage screen share now | Symmetric with "every transport" framing | `stage-channels.md`'s speaker capture path is hardcoded audio-only by design (its own "no camera in this version" decision); adding a video/screen source for speakers changes that doc's decision, not this one's — cross-doc scope creep | **Chosen**: leave for a follow-up to `stage-channels.md`, tracked in `open-questions.md` |

What the chosen option costs: two small, cheap UI touch points (DM header, incoming-call dialog) plus one shared type widened in two files; no new server-side authorization logic, no schema change, no new dependency.

## Risks & rollback

- **What can break**: widening `DmCallMode` is additive at the type level; the gateway's explicit allow-list (`voice.gateway.ts:129`) is the only server-side gate and is updated in the same change, so no existing `'voice'`/`'video'` DM call is affected.
- **What can break**: gating `ChatHeader.tsx`'s screen-share button behind `canShareScreen()` changes existing behavior for any browser that lacks `getDisplayMedia` — today those users see the button and get a caught error; after this change they do not see the button at all. This is the intended fix, not a regression, but is a visible UI change worth flagging to reviewers.
- **Not covered**: simultaneous mic+screen, mid-call "start sharing" without leaving the call, stage screen share, screen-share encoding/quality tuning, a pinned/focused share view — all named explicitly in Scope/Trade-offs, not silently dropped.
- **Rollback**: revert the code; no migration, no schema change, no persisted data shape change. The two `DmCallMode` type widenings and the gateway validation revert independently and cleanly.

## Test plan

Not covered by automated tests (repo has no test suite by policy — no `*.test.ts`/`*.spec.ts` files). Verify with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run i18n:check` (`package.json:23`).

**Manual** (two browser clients, `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` where screen capture needs a fake source):

1. **1-1 DM, mesh transport** (`VOICE_TRANSPORT=mesh`): A opens a DM with B, clicks the new "Share screen" DM header button → A's stream is `getDisplayMedia` → B receives `dm:call:incoming` with `mode: 'screen'`, sees the three-way incoming dialog with the screen-share title/icon, accepts → B's `RemoteVideoTile` for A shows the shared window, `contain`-fit (not cropped), "Sharing screen" label.
2. **1-1 DM, LiveKit transport** (`VOICE_TRANSPORT=livekit`): same scenario — confirm A's track publishes with `Track.Source.ScreenShare` (check `chrome://webrtc-internals` or LiveKit's own room inspector) and B still receives it through `RoomEvent.TrackSubscribed`.
3. **Group DM screen share**: three-member group DM, A shares screen, B and C both see it; B declines/leaves — A's share to C is unaffected (matches existing group-decline semantics from `dm-calls.md`).
4. **Failure case — mobile capability**: with `navigator.mediaDevices.getDisplayMedia` deleted/stubbed to `undefined` (DevTools override, or a real mobile browser), confirm the "Share screen" button is absent from both the channel header and the DM header, on both narrow and wide layouts.
5. **Failure case — declined DM screen-share call**: A starts a `'screen'` DM call, B declines → A sees "Call declined", ring stops, no orphaned call state on either side (matches existing `dm-calls.md` decline flow).
6. **Regression — server voice channel screen share unaffected**: confirm `#general`'s existing "Share screen" button still works exactly as before on both transports (this doc changes shared files `CallStage.tsx`/`ChatHeader.tsx`, so a regression here would be a scope leak).
7. **Regression — stage channel unaffected**: join a stage as audience and as a promoted speaker; confirm no share button appears and speaker capture is still audio-only.

## Deployment notes

- New env vars: none.
- No migration.
- No cache/queue to clear.
- New i18n keys land in both `en` and `vi` catalogs in the same change; run `npm run i18n:check` before merging.
- Breaking API change: none — `dm:call:ring`'s `mode` field only gains an additional accepted value; existing `'voice'`/`'video'` callers are unaffected. No frontend/backend deploy ordering constraint beyond the repo's normal `build:shared` → API → web build order.
