# Feature Spec: Voice & WebRTC Signaling

This specification covers voice channel occupancy, audio/video state synchronization, and the two media transports a call can use: LiveKit (SFU, the deployment target) and full-mesh WebRTC (kept as a rollback path). Design and rationale for the LiveKit work: [`voice-sfu.md`](./voice-sfu.md).

## Goal

Provide real-time voice channel participation, participant state tracking (mute, deafen, speaking, screen-share), and a call media path that scales past the mesh's practical 4-6 participant ceiling.

## Scope

- **In Scope**:
  - Voice channel occupancy state management and room join/leave broadcasts.
  - LiveKit SFU media transport (`VOICE_TRANSPORT=livekit`): join-token issuance, `livekit-client` `Room` connection, TURN via LiveKit's embedded server.
  - The full-mesh WebRTC transport (`VOICE_TRANSPORT=mesh`), kept as a rollback path: server-mediated signaling (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`) and the client's per-peer `RTCPeerConnection`s.
  - Mute/unmute, deafen/undeafen, and speaking indicator state broadcasts (unchanged by transport).
  - Web client call UI controls and audio/video rendering grid.
- **Out of Scope**:
  - Telephony or PSTN integration.
  - Removing the mesh path and the `VOICE_TRANSPORT` flag entirely — that is a dedicated follow-up once LiveKit has run a full release cycle in production (`voice-sfu.md` Changes §8, Risks & Rollback).

## Current Behavior

Which transport a call uses is decided per API deployment by the `VOICE_TRANSPORT` env var (`mesh` default | `livekit`), read in `apps/api/src/common/livekit-config.ts:22-40`; boot fails if `livekit` is chosen without `LIVEKIT_URL`, `LIVEKIT_WS_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` all set (`livekit-config.ts:33-37`).

- **API & Signaling Gateway** (`apps/api/src/modules/realtime/voice.gateway.ts`):
  - `voice:join` (lines 58-119) authorizes the join via `RealtimeAccessService.authorizeCallJoin` (line 73), then, when the transport is `livekit`, mints a join token through `LivekitService.mintJoinAccess` (lines 80-92) before recording the participant; the ack is `{ participants, transport, livekit?, stageRole? }` (`VoiceJoinTransportInfo`, `packages/shared/src/voice.ts:16-21`) — `livekit` is present only on the `livekit` transport (`packages/shared/src/voice.ts:18`).
  - `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` (lines 241-287) still exist and relay via `CallRegistryService.assertPeer`, but each calls `requireMeshTransport()` first (lines 248, 264, 280, defined 293-297) and throws `ForbiddenException('WebRTC relay is disabled')` unless `VOICE_TRANSPORT=mesh` — this is the mesh-only rollback path, not reachable while LiveKit is selected.
  - `soundboard:play` (lines 209-239): unchanged by transport — playback is a client-local broadcast, never mixed into either transport's media (`voice.gateway.ts:204-207` comment; see `docs/features/stickers-and-soundboard.md`).
- **LiveKit token/service wrapper** (`apps/api/src/modules/livekit/livekit.service.ts`): `mintJoinAccess` (lines 53-82) first checks the SFU answers via `RoomServiceClient.listRooms` with a 3s timeout (`LIVEKIT_REQUEST_TIMEOUT_SECONDS`, line 8; called at line 60) — an unreachable LiveKit throws `ServiceUnavailableException('Voice service is unavailable')` (lines 56-58, 65) before any token is minted, so a client never starts local media capture for a call it cannot join. The token grants `roomJoin: true, canSubscribe: true, canPublish: <per caller>, canPublishData: false` (lines 74-80), identity `${userId}:${socketId}` (`livekitIdentity`, lines 129-131), a 10-minute TTL (line 10), and metadata `{userId, displayName}` (line 71). Room name is the call id — `body.channelId` for a channel call or `dm:<conversationId>` for a DM call, unchanged from the mesh's call-key scheme.
- **Web client**:
  - `apps/web/src/hooks/useChannelCall.ts`: media capture (`getUserMedia`/`getDisplayMedia`, lines 154-161) happens before `voice:join` is sent, on both transports; the client only learns which transport to use from the join ack (`result?.transport`, line 215). On `transport: 'livekit'`, it dynamically imports `./livekitCall` and connects a `Room` (`joinLivekitRoom`, lines 292-327); on `mesh` (or no LiveKit result), it falls back to the original `RTCPeerConnection` fan-out (`createOffer` per existing participant, lines 222-224, and `handleUserJoined`'s offer-on-join, lines 60-68, both gated on `callStateRef.current.transport !== 'livekit'`).
  - The mesh's `RTCPeerConnection` is still constructed with a hardcoded `iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]` and no TURN (`createPeer`, lines 371-377) — this remains true only for the mesh path; `joinLivekitRoom`/`connectLivekitCall` (`apps/web/src/hooks/livekitCall.ts:31-58`) pass no `iceServers` at all, because LiveKit supplies ICE/TURN itself from the URL/credentials embedded in the join token.
  - `apps/web/src/hooks/livekitCall.ts`: `connectLivekitCall` (lines 31-58) wires `RoomEvent.TrackSubscribed`/`TrackUnsubscribed` to rebuild each remote participant's `MediaStream` from subscribed tracks (`syncRemote`, lines 37-45) and `RoomEvent.Disconnected` to `onDisconnected` (line 50); `publishStream` (lines 65-77) publishes each captured track exactly once, tagged with the right `Track.Source` for camera/mic/screen. In `useChannelCall.ts`, `onDisconnected` shows `t('call.disconnected')` ("Disconnected from the call.") and ends the call (lines 303-308) unless the disconnect was the client's own `endCall()` (which clears `roomRef.current` first, line 243, so the stale-room check at line 305 skips it).
  - `apps/web/src/components/RemoteVideoTile.tsx`: renders the avatar fallback (lines 30-34) whenever the participant's stream has no video track (`hasVideo`, line 11) — true for an audio-only LiveKit or mesh stream — while a hidden/audio-only `<video>` element (`styles.audioOnly`, lines 22-28) keeps playing the audio track regardless of whether video is shown.

### Offer direction in the mesh path

Only the newcomer offers: it sends an offer to every participant in its `voice:join` ack (`useChannelCall.ts:233`), and existing participants only add the newcomer to their roster on `voice:user-joined`. Until 2026-09-18 existing participants also offered, so both sides offered at once (offer glare) and the browser logged `InvalidStateError ... wrong state: stable`. If two sockets join at the same moment and still offer to each other, `handleOffer` (`useChannelCall.ts:90`) lets the socket with the higher id roll back its own offer and answer, and the other side ignores the incoming offer; an answer to a rolled-back offer is dropped.

## Changes

- LiveKit added as the deployment-target transport, selected by `VOICE_TRANSPORT=livekit`; the mesh remains available as a rollback via `VOICE_TRANSPORT=mesh` (the current default) for at least one release cycle, per `voice-sfu.md`'s rollout design.
- `voice:join`'s ack gained `transport` and an optional `livekit` field, additive over the pre-existing `{ participants }` shape (`VoiceJoinTransportInfo`, `packages/shared/src/voice.ts:16-21`).
- The hardcoded STUN-only ICE config is no longer the only path: it still backs the mesh rollback, but the deployment-target LiveKit path has no client-supplied ICE server list — TURN is provided by LiveKit's own embedded server.
- Modularized WebRTC/LiveKit signaling payload definitions in `packages/shared` (`packages/shared/src/voice.ts`).

## Technical Approach

- **Modules & Files**:
  - `apps/api/src/common/livekit-config.ts` — typed `VOICE_TRANSPORT`/LiveKit env config.
  - `apps/api/src/modules/livekit/livekit.service.ts` (+ `livekit.module.ts`) — token minting, SFU health check, stage publish-right updates.
  - `apps/api/src/modules/realtime/voice.gateway.ts` — `voice:join` transport branching; mesh-only guard on the `webrtc:*` handlers.
  - `apps/web/src/hooks/useChannelCall.ts` — dual-transport call hook.
  - `apps/web/src/hooks/livekitCall.ts` — `livekit-client` `Room` wrapper.
  - `apps/web/src/components/RemoteVideoTile.tsx`
  - `packages/shared/src/voice.ts`
- **Realtime Event Contracts**:
  - `voice:join` / `voice:leave` -> Channel room subscription; join ack now `{ participants, transport, livekit?, stageRole? }`.
  - `voice:state` -> Mute, deafen, video, and screen-share status (unchanged, both transports).
  - `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` -> Mesh-only signaling relay; throw `403` (`WebRTC relay is disabled`) when `VOICE_TRANSPORT=livekit`.

## Trade-offs

See `voice-sfu.md`'s Trade-offs section for the full comparison (self-hosted LiveKit vs. self-hosted mediasoup vs. managed LiveKit Cloud vs. mesh-plus-TURN-only). Summary as implemented:

- **Keeping the mesh path alongside LiveKit, gated by an env flag, vs. deleting it on LiveKit's ship date**: costs a second code path in `useChannelCall.ts` and the gateway (`requireMeshTransport`) to maintain for at least one release cycle. Chosen because this is the largest change to the repo's realtime surface, and a LiveKit-specific outage (SFU down, UDP blocked) needs a rollback lever that does not require a code revert under incident pressure.
- **LiveKit-issued TURN vs. a hand-configured TURN server for the mesh**: adding TURN to the mesh path was ruled out — it fixes the NAT-traversal bug but not the participant-ceiling goal that motivated LiveKit, so effort went into the SFU path instead; the mesh keeps its STUN-only, no-TURN limitation as a known cost of being the rollback-only path.

## Risks & Rollback

- **Risks**: on the mesh path, NAT traversal still fails on restrictive networks with no TURN server configured (unchanged limitation, now scoped to the rollback path only).
- **Rollback**: set `VOICE_TRANSPORT=mesh` and redeploy the API — no code revert needed; already-connected LiveKit participants are not migrated (mixed-transport calls are unsupported, `voice-sfu.md` Edge Cases table).

## Test Plan

Not covered by automated tests (`RULE.md:77`). Verified manually.

- **Manual Verification** (run 2026-09-18, headless Chrome with fake media, local LiveKit):
  - 3-client video call over LiveKit: each client published audio+video once and rendered 2 remote tiles.
  - LiveKit stopped mid-call: connected clients showed the disconnect message and left the call.
  - `voice:join` while LiveKit is down: client got "Voice service is unavailable" and no call was left running.
  - Rejoin after LiveKit restart: worked.
  - `VOICE_TRANSPORT=mesh`: 2-client call still worked over the original `RTCPeerConnection` path.
  - Not verified: a restrictive/symmetric-NAT network (TURN fallback), 8+ participants.

## Deployment Notes

- New env vars: `VOICE_TRANSPORT` (`mesh` | `livekit`, defaults to `mesh`), `LIVEKIT_URL`, `LIVEKIT_WS_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — all four required together when `VOICE_TRANSPORT=livekit` (`livekit-config.ts:33-37`).
- Local dev: `docker-compose.yml` runs a `livekit` service (`livekit/livekit-server:v1.13.7`, `--dev`, ports 7880/7881, UDP 50200-50300 — narrowed from the default range because port 50001 is already used on the dev machine).
- Flipping `VOICE_TRANSPORT` mid-incident does not migrate already-connected participants to the other transport (see Risks & Rollback).
