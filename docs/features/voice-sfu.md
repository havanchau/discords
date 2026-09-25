# Feature Spec: Voice SFU (Selective Forwarding Unit)

This specification covers replacing the full-mesh WebRTC signaling used by voice/video channels and DM calls with a Selective Forwarding Unit (SFU) media server, so a single voice channel can hold more than the mesh's practical 4-6 participant ceiling.

**Depends on**: [`realtime-scale-out.md`](./realtime-scale-out.md) — an SFU issues per-participant join tokens and relies on call authorization (`assertPeer`-equivalent) working correctly when the API runs more than one instance; deploying an SFU before that doc ships means the API must still stay single-instance, which defeats part of the reason to add an SFU (supporting more concurrent load).

**Status**: implemented 2026-09-18 (uncommitted), verified locally against a LiveKit container — see Deviations From The Original Design. `VOICE_TRANSPORT` still defaults to `mesh`. Local dev was run with `VOICE_TRANSPORT=livekit` on 2026-09-25 against the `livekit` compose service and a 2-client call was verified end to end (both clients saw `#general - 2 participants`; the LiveKit container logged both participants in the same room with track publishes, so media went through the SFU, not the mesh fallback). No deployed environment has been flipped.

## Goal

Remove the client-bandwidth/CPU ceiling of full-mesh P2P so a voice or video channel can support meaningfully more than 5-6 active participants, and remove the hardcoded public STUN server with no TURN fallback that causes call setup to fail on restrictive networks.

**Acceptance criteria**:

- [ ] A voice/video channel with more than 6 simultaneous participants remains usable (audio/video keeps flowing) instead of degrading as today's mesh does.
- [x] Each client uploads its own media stream once, regardless of participant count (no more N-1 uploads of the same stream). Verified with 3 clients; see Deviations.
- [x] Existing `voice:join` / `voice:state` / `voice:leave` / `voice:active` / `dm:call:*` client-facing socket contracts continue to work unchanged from the web client's perspective (join still returns participant info; state updates still broadcast the same shape). `voice:join`'s response gains an additive `livekit: { url, token }` field; nothing existing is removed from the response shape.
- [x] Call join is still authorized through the existing membership/permission check (`RealtimeAccessService.authorizeCallJoin`) before a client can obtain an SFU access token.
- [ ] TURN is configured and used as a fallback; the hardcoded `stun:stun.l.google.com:19302` in `useChannelCall.ts:257` is replaced by LiveKit's own embedded TURN/ICE handling (no client-supplied `iceServers` literal remains).
- [ ] `docs/features/voice-webrtc.md` and `docs/features/dm-calls.md` are updated in place to describe the LiveKit architecture once implemented (not forked into new files).

## Scope

**In scope**

- Self-hosted LiveKit (`livekit-server`, OSS) as the SFU, added as a `livekit` service in `docker-compose.yml` for local dev.
- Replacing the per-peer `RTCPeerConnection` mesh in `apps/web/src/hooks/useChannelCall.ts` with `livekit-client`'s `Room` connection.
- Server-side authorization and LiveKit access-token issuance path (reusing `RealtimeAccessService.authorizeCallJoin` before minting a token), using `livekit-server-sdk`.
- Disposition of `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` and `CallRegistryService.assertPeer` (LiveKit does its own client-to-server signaling over its own WS protocol; peer-to-peer signaling relay between two client sockets is no longer part of the base call flow).
- A rollout feature flag so the mesh path can be restored without a code revert during the LiveKit rollout window.
- TURN via LiveKit's embedded TURN server; removing the hardcoded STUN URL.
- Keeping `voice:join`, `voice:state`, `voice:active`, `dm:call:*` event contracts stable for the UI (`CallStage`, incoming-call dialog, DM call buttons).

**Out of scope**

- Call recording.
- Simulcast tuning beyond LiveKit's stated default (adaptive quality per subscriber is accepted as-is from LiveKit; no custom bitrate/layer logic).
- PSTN / dial-in integration.
- Live-streaming or "stage" style large-audience channels (designed separately in [`stage-channels.md`](./stage-channels.md), which now depends on this doc's token-issuance point).
- Multi-region SFU placement / media server geo-routing.
- Server-side mixing of soundboard clips into the LiveKit room's media (see Changes §6 — kept as today's client-side playback).
- Migrating to LiveKit Cloud (the design here makes that an env-only change later, but does not schedule or perform the migration).

## Current Behavior

### Server-side signaling relay (full mesh)

`apps/api/src/modules/realtime/voice.gateway.ts` — class comment (line 29): "Voice and video: call membership, DM ringing, and WebRTC signaling relay."

- `voice:join` (lines 45-81): rate-limited 10/60s (line 57); calls `access.authorizeCallJoin(user.id, body.channelId)` (line 59); builds a `CallParticipant`; calls `calls.join`; the socket joins the `call:<channelId>` room; emits `voice:user-joined` to the room; calls `calls.emitActiveCall`; for DM call keys also calls `dmCalls.participantJoined`. Returns `{ participants: existingParticipants }` to the joiner (line 80) — **this is the mesh fan-out point**: the joining client uses this list to open one `RTCPeerConnection` per existing participant and start offers to each (`useChannelCall.ts:186-193`).
- `dm:call:ring` (lines 83-94, 10/60s), `dm:call:decline` (96-103, 20/60s), `dm:call:cancel` (105-112, 20/60s).
- `voice:state` (114-141, 30/60s): emits `voice:user-updated` and `calls.emitActiveCall`.
- `voice:leave` (143-147).
- `soundboard:play` (154-184): validates the caller is a current call participant via `calls.requireParticipant`, then broadcasts `soundboard:played` to `callRoom(channelId)` — client-side playback only, no media-plane involvement (see Changes §6).
- `webrtc:offer` (186-198, 30/60s), `webrtc:answer` (200-212, 30/60s), `webrtc:ice-candidate` (214-226, 120/60s): all three call `calls.assertPeer(client, channelId, targetSocketId)` (`call-registry.service.ts:132-139`) then `publisher.emitToRoom(targetSocketId, ...)`, routing to a socket-id-scoped room, with `fromSocketId: client.id` in the payload. This is server-relayed signaling for **peer-to-peer** connection setup, not media relay — the API never touches the actual audio/video bytes today.

`CallParticipant` shape — `apps/api/src/modules/realtime/call-registry.service.ts:7-16`: `socketId, userId, username, displayName, mode ('voice'|'video'|'screen'), isMuted, isCameraOff, isSharingScreen`. `CallRegistryService` stores participants in Redis (`participantsKey`, `call-registry.service.ts:238-240`) with a heartbeat-based TTL (`entryTtlMs`, line 234-236) so a crashed API instance's participants are pruned rather than left as ghosts — this is the multi-instance membership store `realtime-scale-out.md` added, and it is unaffected by this doc: it keeps being the source of truth for who is in a call, independent of media transport.

`ActiveCallSummary` — `call-registry.service.ts:18-23`: `channelId, mode, participants, screenSharer?`. Mode derivation (lines 148-153): screen wins, then video, else voice.

### Client-side mesh

- `apps/web/src/hooks/useChannelCall.ts` (330 lines): `peersRef: useRef<Map<string, RTCPeerConnection>>` at line 32 — one `RTCPeerConnection` per remote socket, i.e. the mesh itself.
- Media capture: `getDisplayMedia({ video: true, audio: true })` for screen share (line 143), else `getUserMedia` (lines 144-147).
- On `voice:join`'s ack, the client filters out itself from `result.participants` (line 187) and calls `createOffer` for each remaining participant (lines 190-192) — this fan-out loop is exactly what LiveKit's own room-join model replaces.
- Peer connections are created at line 256 with `iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]` (line 257) — a **hardcoded public Google STUN server with no TURN server configured**. Calls fail with no fallback on symmetric-NAT or otherwise restrictive networks.
- `apps/web/src/components/RemoteVideoTile.tsx` (30 lines): renders one remote stream tile per peer, from `RemoteMedia.stream` populated by `peer.ontrack` (`useChannelCall.ts:277-283`).

### Documented as the current, deliberate baseline

`docs/features/voice-webrtc.md` currently lists, under Out of Scope: "SFU (Selective Forwarding Unit) media server infrastructure (mesh P2P signaling is used for baseline)." Its Trade-offs section chose "Full Mesh P2P for baseline implementation" with the stated cost: "High client bandwidth and CPU usage for voice channels with more than 4-6 active video streams." **This doc supersedes that baseline decision and updates `docs/features/voice-webrtc.md` in place** when implemented — it is not forked into a separate spec.

`docs/features/dm-calls.md` covers DM ringing on top of the same voice gateway and `CallRegistryService`; its ringing protocol, call keys, and UI are unaffected by moving from mesh to LiveKit media transport, but its "Current Behavior" section's references to `webrtc:offer`/`answer`/`ice-candidate` must be updated to match this doc's disposition (Changes §4) once implemented.

### Bandwidth math (mesh vs. SFU)

This is an arithmetic estimate from stream count, **not a measurement taken in this repo** — no load test or bandwidth profiling exists here today.

- Full mesh, N participants each publishing one ~1.5 Mbps video stream: every client holds N-1 peer connections and uploads its own stream N-1 times. At N=6, that is roughly 7.5 Mbps of upload per client.
- With LiveKit, each client uploads its stream once (~1.5 Mbps) regardless of N, and downloads up to N-1 streams (LiveKit adapts per-subscriber quality via simulcast, which this doc does not tune beyond its default).

## Changes

### Rules / Flow

1. **Media path**: clients no longer open a `RTCPeerConnection` per remote participant. Each client opens one `livekit-client` `Room` connection, publishes its local track(s), and subscribes to the tracks LiveKit forwards for other participants in the same room.
2. **Authorization stays server-side and unchanged in intent**: `voice:join` still calls `access.authorizeCallJoin` before anything else (unchanged call site, `voice.gateway.ts:59`). On success, the API additionally mints a LiveKit access token via `livekit-server-sdk`'s `AccessToken` and returns it alongside the existing `{ participants }` shape: `{ participants, livekit: { url, token } }`. The existing participant list is kept in the response even though the client no longer uses it to drive per-peer offers, because `voice:user-joined`/`voice:user-updated`/`voice:user-left` still render the participant roster and mute/camera/screen-share badges from `CallRegistryService` state, independent of LiveKit.
3. **Room naming reuses the existing call key, not the Socket.IO room name**: the LiveKit room name is the same string already used as the call id everywhere else in the gateway — `body.channelId` for a channel call, or `dm:<conversationId>` for a DM call (`parseDmCallKey`/`toDmCallKey`, `dm-calls.service.ts:9-18`). This is deliberately **not** `calls.callRoom(channelId)` (`call-registry.service.ts:46-48`, which returns `call:<channelId>`) — that string is a Socket.IO room name for signaling broadcasts, a separate namespace from the LiveKit room name; reusing the same raw id keeps the mapping obvious without conflating the two transports.
4. **Participant identity**: the LiveKit participant identity is `${userId}:${socketId}`, not the bare `userId`. LiveKit does not allow two connections with the same identity in one room to coexist by default, and the mesh's participant model (`CallParticipant.socketId` as the addressable unit, `call-registry.service.ts:7-16`) already treats each socket — i.e. each open tab/device — as its own peer. Using `${userId}:${socketId}` preserves that "one entry per connected device" behavior, while participant metadata (set on the token, see the LiveKit `ParticipantInfo.metadata` field) carries `{ userId, displayName }` so server-side code (e.g. `stage-channels.md`'s moderator checks) can still resolve the underlying user.
5. **`CallRegistryService` keeps its role as the source of truth for who is in a call** (membership, mute/camera/screen-share state, `ActiveCallSummary`) — that bookkeeping is unchanged by this doc, because it is metadata, not media transport. It also keeps depending on `realtime-scale-out.md`'s Redis-backed membership so authorization and active-call summaries are correct across instances.
6. **Soundboard stays client-side, unchanged by this doc.** `stickers-and-soundboard.md`'s `soundboard:play`/`soundboard:played` flow (`voice.gateway.ts:154-184`) already ships and works against the mesh transport purely as a socket broadcast; each client plays the clip locally via the browser's `Audio` API, independent of the WebRTC/LiveKit media path. Adding true server-side mixing (the clip arriving as an actual audio track other participants "hear" through their received media, including deafened-output edge cases) would require a synthetic LiveKit participant — a small "bot" process using `livekit-server-sdk`'s room-service or a headless `livekit-client` publisher that decodes the clip file and publishes it as an Opus track into the room. That is materially more engineering than reusing the two-line broadcast handler that already exists and is already shipped (`docs/features/stickers-and-soundboard.md`'s "Deviations From The Original Design" confirms this handler is implemented, not just designed). **Recommendation: do not add server-side mixing as part of this doc.** The smallest correct option is to leave `soundboard:play`/`soundboard:played` exactly as they are; a LiveKit-side "bot publisher" for true media-plane mixing is a separate, explicitly scoped follow-up if product later decides the client-side approximation is not good enough (`docs/features/stickers-and-soundboard.md`'s Deployment Notes already flags this as something to revisit once an SFU ships — that revisit is now "resolved as: not changing it," which the owner of `stickers-and-soundboard.md` should fold back into that doc when this ships).
7. **`webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` and `assertPeer`**: LiveKit's client-to-server signaling (its own WebSocket protocol inside `livekit-client`, separate from the app's Socket.IO connection) replaces peer-to-peer offer/answer/ICE relay entirely — clients never negotiate directly with each other once LiveKit is in place. **Recommendation: keep these three events and `CallRegistryService.assertPeer` registered, but only reachable while the rollout flag (Changes §8) still selects the mesh path.** They are not repurposed for client-to-LiveKit signaling — `livekit-client` handles that internally and does not need an application-level relay. Once the mesh path is retired for good (see Deployment Notes), delete the three handlers and `assertPeer` in the same follow-up that removes the flag; do not delete them in the same change that ships LiveKit, so a broken rollout can flip back without a code revert under incident pressure.
8. **Rollout flag**: a new env-driven switch, `VOICE_TRANSPORT` (`mesh` | `livekit`), read through the API's typed config service. `voice:join`'s response includes `transport: 'mesh' | 'livekit'` so the client knows which path to take; when `mesh`, the response omits `livekit` and keeps today's shape exactly, so a flip back to `mesh` is a redeploy with one env var changed, not a code revert. **Recommendation: keep the mesh path in the codebase, gated by this flag, for at least one release cycle after LiveKit ships**, then remove the flag and the mesh code (`useChannelCall.ts`'s `RTCPeerConnection` path, the three `webrtc:*` handlers, `assertPeer`) in a dedicated follow-up change — not silently left in place indefinitely. The alternative (delete mesh code the same day LiveKit ships) is rejected: this is the largest change to the realtime surface in the repo, and a stateful media service failure class (LiveKit down, UDP blocked in some environment) has no other rollback lever once the mesh code is gone.
9. **TURN**: LiveKit's embedded TURN server (enabled via `--dev` mode config, or the dedicated TURN section of `livekit-server`'s config in production) replaces the client's hardcoded `iceServers` array entirely — `livekit-client` negotiates ICE/TURN internally using the URL/credentials embedded in the access token's connection info, so no ICE server list is constructed by hand in `useChannelCall.ts` at all.
10. **`voice:state`, `voice:active`, `dm:call:*` contracts**: unchanged. They describe call membership and per-participant UI state (mute, camera, screen-share), which remains `CallRegistryService`'s responsibility regardless of the media transport underneath.

### Edge cases

| Case | Expected behavior |
|---|---|
| LiveKit unreachable when a client tries to join | `voice:join` fails with a clear error before the client attempts media setup (the `livekit-server-sdk` token-mint call, or `RoomServiceClient` health check, throws and the gateway surfaces it the same way `authorizeCallJoin` failures already are); existing timeout/error handling pattern in `startCall`'s ack callback (`useChannelCall.ts:180-184`) is reused. |
| A participant already in-call when LiveKit restarts | `livekit-client`'s `Room` auto-reconnect (built into the SDK) attempts to resume; if it cannot, the client surfaces a "call disconnected" state and the user must rejoin via `voice:join` again — same user-facing shape as today's mesh peer-connection-state handling (`useChannelCall.ts:285-289`), just backed by LiveKit's reconnect event instead of `RTCPeerConnection.onconnectionstatechange`. |
| Empty channel / no other participants | Unchanged from today: a lone joiner still gets `{ participants: [] }` plus a valid LiveKit token/room to publish into with no subscribers yet. |
| More participants than LiveKit's own configured room limit (if any) | Out of scope for this doc to define a number — record whatever ceiling the deployed `livekit-server` config enforces by default; do not invent one. |
| Unauthorized join attempt | Unchanged: rejected by `access.authorizeCallJoin` before any LiveKit token is issued. |
| Rollout flag flipped mid-incident | A client already connected via LiveKit keeps its session (the flag only affects new `voice:join` calls); new joiners to the same call get `transport: 'mesh'` and cannot see LiveKit's publishers — **mixed-transport calls are not supported**, so flipping the flag must be paired with asking active LiveKit participants to rejoin, and is a real operational caveat, not a silent hot-swap. |

## Technical Approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/src/modules/realtime/voice.gateway.ts` | `voice:join` mints and returns a LiveKit access token (`{ transport, participants, livekit?: { url, token } }`) when `VOICE_TRANSPORT=livekit`; `webrtc:offer`/`answer`/`ice-candidate` handlers gated to the `mesh` path only, removed once that path is retired. |
| `apps/api/src/modules/realtime/call-registry.service.ts` | Unchanged data shape (`CallParticipant`/`ActiveCallSummary`); `assertPeer` stays but is only called from the mesh-only `webrtc:*` handlers. |
| `apps/api/src/modules/realtime/realtime-access.service.ts` | `authorizeCallJoin` reused as-is ahead of token issuance; no signature change. |
| New: `apps/api/src/modules/realtime/livekit-token.service.ts` | Wraps `livekit-server-sdk`'s `AccessToken` (token mint, room name = call id, identity = `${userId}:${socketId}`, grants per Changes §4) and `RoomServiceClient` (used by `stage-channels.md` for live permission updates) behind one module, following the repo's existing pattern of one wrapper module per external integration (mirrors `soundboard-playback.service.ts`'s single-responsibility shape). |
| New: `apps/api/src/config/livekit.config.ts` (or the repo's existing typed-config location) | `LIVEKIT_URL`, `LIVEKIT_WS_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VOICE_TRANSPORT` read through the config service, not raw `process.env`. |
| `apps/web/src/hooks/useChannelCall.ts` | `peersRef`/`RTCPeerConnection` mesh path kept, but only exercised when the server reports `transport: 'mesh'`; a new `livekit-client` `Room` path is added for `transport: 'livekit'`; media capture (`getUserMedia`/`getDisplayMedia`) unchanged — the captured `MediaStreamTrack`s are published to the `Room` instead of added to per-peer connections; no hardcoded `iceServers` remains in the LiveKit path. |
| `apps/web/src/components/RemoteVideoTile.tsx` | Track source becomes a `RemoteTrackPublication`'s `MediaStreamTrack` (from `livekit-client`'s `RoomEvent.TrackSubscribed`) instead of the mesh's raw `RTCPeerConnection` remote stream when `transport: 'livekit'`; rendering contract (one tile per remote participant) is unchanged. |
| `docs/features/voice-webrtc.md` | Updated in place: Scope, Current Behavior, Trade-offs, Deployment Notes rewritten for the LiveKit architecture; same file, not a fork. |
| `docs/features/dm-calls.md` | Current Behavior section's references to mesh signaling events updated to reflect the `mesh`/`livekit` split. |
| `docker-compose.yml` | New `livekit` service (see Deployment Notes for the exact shape) — **not edited by this doc**, since docs may not touch config files; the shape is specified here for whoever implements it. |
| `.env.example` | New vars (see Deployment Notes) — **not edited by this doc**; exact lines specified for the implementer. |

**No Prisma/DB change.** LiveKit room membership is not persisted — `CallRegistryService`'s existing Redis-backed participant tracking remains the only durable-ish (heartbeat-TTL'd) record of who is in a call.

**Libraries**

- `livekit-server-sdk` `2.19.0` (Apache-2.0, Node >= 19; checked on the npm registry 2026-09-18) — mints access tokens and calls `RoomServiceClient.updateParticipant` for `stage-channels.md`'s publish/subscribe permission changes. Pinned exactly in `apps/api/package.json`.
- `livekit-client` `2.22.3` (Apache-2.0; checked on the npm registry 2026-09-18) — replaces the mesh's raw `RTCPeerConnection` usage with `Room`, `RoomEvent`, `Track` APIs. Pinned exactly in `apps/web/package.json`.
- Neither library is currently in `apps/api/package.json` or `apps/web/package.json` (grepped: no `livekit` references in either lockfile-adjacent manifest today).

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Self-hosted LiveKit (chosen)** | Open-source, provides a full room/participant/reconnection model (not just raw primitives like mediasoup), has a mature TypeScript client SDK, can be self-hosted in Docker with a documented UDP port range; moving to LiveKit Cloud later is an env-var change only (`LIVEKIT_URL`/`LIVEKIT_WS_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`), no code change, because both self-hosted and Cloud speak the identical client/server SDK protocol | Still a new stateful service to operate, patch, and monitor; still needs a public IP and UDP port range reachable from clients in production, which does not fit the current single-container `docker-compose.yml` model (see Deployment Notes) | **Chosen**: closest match to "rewrite `useChannelCall.ts` once, get a maintained client SDK and server room model, keep a clean path to a managed alternative later" |
| Self-hosted mediasoup | Full control over media pipeline; no per-minute/per-participant vendor cost | Gives low-level primitives (routers, transports, producers/consumers) with no built-in room/participant/reconnection model — a meaningful custom layer must be built and maintained on top of it; no equivalent of LiveKit's `RoomServiceClient.updateParticipant` for `stage-channels.md`'s live publish/subscribe toggling, so stage channels would need bespoke signaling for that too | Ruled out: strictly more engineering than LiveKit for the same operational burden, with no offsetting benefit given the decision to self-host either way |
| Managed LiveKit Cloud | No media-server operations at all; identical client/server SDK to self-hosting | Recurring per-participant-minute cost with no in-repo precedent for that kind of spend; introduces a third-party dependency for a core feature | Ruled out for now per the user's decision to self-host; the design here keeps this reachable later as an env-only change, so it is not foreclosed |
| Keep full mesh, just fix STUN/TURN | Zero new infrastructure; smallest possible change | Does not address the actual goal (participant ceiling); TURN alone does not fix the N-1 upload bandwidth problem that motivates this doc | Ruled out: fixes a real bug (no TURN) but not the stated goal |

**What the chosen option costs**: this is the largest change to the repo's realtime surface to date — it touches the client media pipeline (`useChannelCall.ts`), the server signaling contract (`voice.gateway.ts`), and requires new infrastructure (LiveKit, reachable over UDP, with embedded TURN). It also carries a real deployment-model consequence: self-hosted LiveKit does not fit the current one-container-per-service `docker-compose.yml` model or a typical PaaS web dyno (Vercel/Render-style platforms do not expose arbitrary UDP port ranges), so production hosting needs a UDP-reachable target (a VM/container platform, or a future switch to LiveKit Cloud) — this is a hard prerequisite, not a solved problem (see Deployment Notes).

## Deviations From The Original Design

Written back after implementing, so the doc matches the code:

- **Token service lives in its own module.** `apps/api/src/modules/livekit/livekit.service.ts` and
  `livekit.module.ts` instead of `realtime/livekit-token.service.ts`, because the kick/ban path in
  `ServersModule` also needs it (`stage-channels.md`) and importing `RealtimeModule` there would make
  a module cycle. The typed config reader is `apps/api/src/common/livekit-config.ts`, next to
  `redis-config.ts` and `limits-config.ts` (the repo has no `src/config/` folder).
- **Join-time health check.** `mintJoinAccess` calls `RoomServiceClient.listRooms([room])` with a
  3-second timeout before minting (`livekit.service.ts`), because minting a JWT is local and would
  succeed while the SFU is down. Failure → `503 Voice service is unavailable` in the ack.
- **Token details.** TTL 10 minutes (it only has to outlive the `Room.connect()` after the ack);
  `canPublishData: false`; metadata `{ userId, displayName }`.
- **Media is still captured before `voice:join`.** Edge case "LiveKit unreachable" asked for no
  capture before a failed join. The client learns the transport only from the ack, and the mesh path
  needs the local stream before other participants' offers arrive, so the order is unchanged; on a
  failed ack the stream is stopped at once. Stage audience joins capture nothing (receive-only).
- **`livekit-client` is loaded lazily.** `useChannelCall.ts` imports `hooks/livekitCall.ts` with a
  dynamic `import()` only when the ack says `transport: 'livekit'`, so mesh deployments do not ship
  the SDK in the main bundle.
- **`webrtc:*` handlers under LiveKit** throw `ForbiddenException('WebRTC relay is disabled')`
  (`voice.gateway.ts`, `requireMeshTransport`); nothing is relayed.
- **`RemoteVideoTile`** shows the participant's avatar for an audio-only stream and keeps a hidden
  `<video>` element playing the audio; before, an audio-only stream rendered an empty video box.
- **Local LiveKit** uses UDP 50200–50300 (`docker-compose.yml`), not 50000–50100: 50001 is taken on
  the dev machine.
- **Verification (2026-09-18, local LiveKit `v1.13.7`, headless Chrome with fake media):** 3-client
  video call in a text channel — every client published audio and video once (LiveKit reports 2
  tracks per participant) and rendered 2 remote tiles; LiveKit stopped mid-call → each client showed
  "Disconnected from the call." and left; join while LiveKit was down → "Voice service is
  unavailable", no call left running; rejoin after restart worked; `VOICE_TRANSPORT=mesh` → a
  2-client video call still connected over `RTCPeerConnection` and a stage join was refused. Not
  verified: 8+ participants (acceptance criterion 1), a symmetric-NAT client using TURN (criterion
  5), and a production deployment.
- **Pre-existing mesh issue seen during the rollback check, fixed in a follow-up the same day:**
  when someone joined, both the newcomer and existing participants sent an offer (offer glare). Now
  only the newcomer offers; see `voice-webrtc.md` → Offer direction in the mesh path.

## Risks & Rollback

- **What can break**: a regression here breaks every voice/video call and every DM call, not just a slice of functionality.
- **New operational burden**: LiveKit is a new stateful service to monitor, patch, and scale — distinct in kind from the API's existing stateless-per-request model.
- **Not covered**: this doc does not solve multi-region media routing, recording, or PSTN; it also inherits `realtime-scale-out.md`'s open item that Redis itself is a new single point of failure, since call authorization still runs through that layer.
- **Mixed-transport calls are unsupported** (Edge cases table) — flipping `VOICE_TRANSPORT` mid-incident does not migrate already-connected participants.
- **Rollback**: flip `VOICE_TRANSPORT` back to `mesh` (env var + redeploy, no code revert) for at least one release after LiveKit ships, per Changes §7-8. Once the LiveKit path is proven in production for a release cycle, remove the mesh code, the flag, and update `docs/features/voice-webrtc.md` to drop both entirely.

## Test Plan

**Automated**

- Not covered by automated tests per `RULE.md:77` (this repo forbids `*.test.ts`/`*.spec.ts` files and test runners). Verify with `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run docs:check`.

**Manual**

1. Join a voice channel with 2 participants (`VOICE_TRANSPORT=livekit`): confirm audio/video works exactly as it does today from the user's perspective.
2. **Fake-media multi-client scenario**: launch 3 separate Chrome profiles/windows pointed at the local dev stack, each with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (Chrome's synthetic camera/mic, no real hardware needed) and a distinct logged-in user; all three join the same voice channel. Confirm each of the 3 clients renders exactly 2 remote tiles, mute/camera toggles on one client propagate to the other two via `voice:user-updated`, and closing one tab produces a `voice:user-left` for the remaining two.
3. Join a voice channel with 8+ participants (more than the mesh's practical ceiling), using the same fake-media technique or real clients: confirm audio/video remains usable for all participants, and each client's outbound upload bandwidth stays roughly constant (one stream) rather than growing with participant count — check via `chrome://webrtc-internals` on one client.
4. Toggle mute, camera, and screen-share mid-call: confirm `voice:state` / `voice:user-updated` broadcasts and the UI (`RemoteVideoTile`, call controls) behave identically to the pre-LiveKit mesh version.
5. From a client on a restrictive/symmetric-NAT network (or with a firewall rule blocking direct UDP to simulate one), confirm the call connects via LiveKit's embedded TURN instead of failing silently as it does today with the hardcoded STUN-only config.
6. Start and answer a DM call (`dm:call:ring` / `decline` / `cancel` flow from `docs/features/dm-calls.md`) end to end: confirm ringing, acceptance, and the resulting call media all work unchanged from the user's perspective.
7. **Failure case — LiveKit down**: stop the `livekit` container, then attempt `voice:join`: confirm the client gets a clear "call unavailable" error (not a silent hang) and does not start local media capture.
8. **Failure case — kill LiveKit mid-call**: with an active call, stop the `livekit` container: confirm connected clients surface a "call disconnected" state, and rejoining works once LiveKit is back.
9. **Rollback path**: with `VOICE_TRANSPORT=mesh`, confirm a 2-3 participant call still works via the original `RTCPeerConnection` path, proving the rollback path is real and not just theoretical.

## Deployment Notes

- **Hard prerequisite, not solved by this doc**: production hosting needs a UDP port range reachable from clients plus a public IP (self-hosted LiveKit), or a move to LiveKit Cloud. Neither fits the current single-container `docker-compose.yml` model (`api`, `web`, `redis`, `postgres`, all TCP-only) or a typical PaaS web dyno. This must be decided and provisioned before self-hosted LiveKit ships to production; the design here keeps the LiveKit Cloud fallback a pure env-var swap so this decision does not block the code change itself.
- **New `docker-compose.yml` service (local dev)** — illustrative shape, not applied by this doc:

  ```yaml
  livekit:
    image: livekit/livekit-server:v1.13.7 # latest stable tag on Docker Hub, checked 2026-09-18; never `:latest`
    container_name: discord-clone-livekit
    restart: unless-stopped
    command: --dev
    environment:
      LIVEKIT_KEYS: '${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}'
    ports:
      - '7880:7880' # HTTP/WS signaling (client + server SDK)
      - '7881:7881' # RTC over TCP fallback
      - '50000-50100:50000/udp-50100/udp' # media (narrowed range for local dev; production needs a wider range)
  ```

- **New env vars** — `.env.example` cannot be edited by this task; add these exact lines by hand:

  ```
  LIVEKIT_URL=http://livekit:7880
  LIVEKIT_WS_URL=ws://localhost:7880
  LIVEKIT_API_KEY=devkey
  LIVEKIT_API_SECRET=devsecret1234567890devsecret1234
  VOICE_TRANSPORT=mesh
  ```

  `LIVEKIT_URL` is the API's server-to-server endpoint (token mint validation, `RoomServiceClient` calls); `LIVEKIT_WS_URL` is the public-facing address handed to the browser client for `livekit-client`'s `Room.connect()` — these differ in Docker Compose (internal service name vs. `localhost`) and must differ again in production (internal address vs. public DNS/TLS endpoint). Moving to LiveKit Cloud later means only these four values change (to the Cloud project's URL and API credentials) plus `LIVEKIT_WS_URL` becoming `wss://<project>.livekit.cloud` — no code change, per the Trade-offs recommendation.
- `VOICE_TRANSPORT` starts at `mesh` in every environment until LiveKit is verified working there, then flips to `livekit` per environment independently (dev, staging, then production) — never a single global flip.
- Breaking API/event-contract change: none while the rollout flag exists (the response is additive). Removing `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` (Changes §7) is deferred to the follow-up that retires the flag, and **that** removal requires the frontend and backend to ship together.
- `docs/features/voice-webrtc.md` and `docs/features/dm-calls.md` updated in place in the same change that ships this.
- Deploys only after [`realtime-scale-out.md`](./realtime-scale-out.md) ships, per the dependency stated at the top of this doc.
- `docs/features/stickers-and-soundboard.md`'s Deployment Notes line ("This doc's soundboard design should be revisited... once `voice-sfu.md` ships") is resolved by Changes §6 above: no change to soundboard. Whoever implements this doc should fold that resolution back into `stickers-and-soundboard.md` in the same change (not touched here, since this task is scoped to `voice-sfu.md` and `stage-channels.md` only).
