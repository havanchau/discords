# Feature Spec: Voice SFU (Selective Forwarding Unit)

This specification covers replacing the full-mesh WebRTC signaling used by voice/video channels and DM calls with a Selective Forwarding Unit (SFU) media server, so a single voice channel can hold more than the mesh's practical 4-6 participant ceiling.

**Depends on**: [`realtime-scale-out.md`](./realtime-scale-out.md) — an SFU issues per-participant join tokens and relies on call authorization (`assertPeer`-equivalent) working correctly when the API runs more than one instance; deploying an SFU before that doc ships means the API must still stay single-instance, which defeats part of the reason to add an SFU (supporting more concurrent load).

## Goal

Remove the client-bandwidth/CPU ceiling of full-mesh P2P so a voice or video channel can support meaningfully more than 5-6 active participants, and remove the hardcoded public STUN server with no TURN fallback that causes call setup to fail on restrictive networks.

**Acceptance criteria**:

- [ ] A voice/video channel with more than 6 simultaneous participants remains usable (audio/video keeps flowing) instead of degrading as today's mesh does.
- [ ] Each client uploads its own media stream once, regardless of participant count (no more N-1 uploads of the same stream).
- [ ] Existing `voice:join` / `voice:state` / `voice:leave` / `voice:active` / `dm:call:*` client-facing socket contracts continue to work unchanged from the web client's perspective (join still returns participant info; state updates still broadcast the same shape).
- [ ] Call join is still authorized through the existing membership/permission check (`RealtimeAccessService.authorizeCallJoin`) before a client can obtain SFU media credentials.
- [ ] TURN is configured and used as a fallback; the hardcoded `stun:stun.l.google.com:19302` in `useChannelCall.ts:255` is replaced by server-provided ICE server config.
- [ ] `docs/features/voice-webrtc.md` and `docs/features/dm-calls.md` are updated in place to describe the SFU architecture once implemented (not forked into new files).

## Scope

**In scope**

- Introducing an SFU media server component and a chosen SDK/vendor (see Trade-offs).
- Replacing the per-peer `RTCPeerConnection` mesh in `apps/web/src/hooks/useChannelCall.ts` with a single publish/subscribe connection to the SFU per client.
- Server-side authorization and SFU access-token issuance path (reusing `RealtimeAccessService.authorizeCallJoin` before minting a token).
- Deciding the fate of `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` and `CallRegistryService.assertPeer` (peer-to-peer signaling relay is no longer needed between clients once an SFU is in place; these events either get removed or repurposed for client-to-SFU signaling, depending on the chosen SDK's own signaling protocol).
- TURN server configuration, and removing the hardcoded STUN URL.
- Keeping `voice:join`, `voice:state`, `voice:active`, `dm:call:*` event contracts stable for the UI (`CallStage`, incoming-call dialog, DM call buttons).

**Out of scope**

- Call recording.
- Simulcast tuning beyond the SFU SDK's stated default (adaptive quality per subscriber is accepted as-is from whichever SDK is chosen; no custom bitrate/layer logic).
- PSTN / dial-in integration.
- Live-streaming or "stage" style large-audience channels (this is about normal voice/video channels and DM calls, not one-to-many broadcast).
- Multi-region SFU placement / media server geo-routing.

## Current Behavior

### Server-side signaling relay (full mesh)

`apps/api/src/modules/realtime/voice.gateway.ts` — class comment (line 18): "Voice and video: call membership, DM ringing, and WebRTC signaling relay."

- `voice:join` (lines 32-68): rate-limited 10/60s (line 44); calls `access.authorizeCallJoin(user.id, channelId)` (line 46); builds a `CallParticipant`; calls `calls.join`; the socket joins the `call:<channelId>` room; emits `voice:user-joined` to the room; calls `calls.emitActiveCall`; for DM call keys also calls `dmCalls.participantJoined`. Returns `{ participants: existingParticipants }` to the joiner — **this is the mesh fan-out point**: the joining client uses this list to open one `RTCPeerConnection` per existing participant and start offers to each.
- `dm:call:ring` (lines 70-81, 10/60s), `dm:call:decline` (83-90, 20/60s), `dm:call:cancel` (92-99, 20/60s).
- `voice:state` (101-128, 30/60s): emits `voice:user-updated` and `calls.emitActiveCall`.
- `voice:leave` (130-134).
- `webrtc:offer` (136-148, 30/60s), `webrtc:answer` (150-162, 30/60s), `webrtc:ice-candidate` (164-176, 120/60s): all three call `calls.assertPeer(client, channelId, targetSocketId)` then `publisher.emitToRoom(targetSocketId, ...)`, routing to a socket-id-scoped room, with `fromSocketId: client.id` in the payload. This is server-relayed signaling for **peer-to-peer** connection setup, not media relay — the API never touches the actual audio/video bytes today.

`CallParticipant` shape — `apps/api/src/modules/realtime/call-registry.service.ts:6-15`: `socketId, userId, username, displayName, mode ('voice'|'video'|'screen'), isMuted, isCameraOff, isSharingScreen`.

`ActiveCallSummary` — `call-registry.service.ts:17-22`: `channelId, mode, participants, screenSharer?`. Mode derivation (lines 114-122): screen wins, then video, else voice.

### Client-side mesh

- `apps/web/src/hooks/useChannelCall.ts` (328 lines): `peersRef: useRef<Map<string, RTCPeerConnection>>` at line 32 — one `RTCPeerConnection` per remote socket, i.e. the mesh itself.
- Media capture: `getDisplayMedia({ video: true, audio: true })` for screen share (lines 141-142), else `getUserMedia`.
- Peer connections are created at line 254 with `iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]` (line 255) — a **hardcoded public Google STUN server with no TURN server configured**. Calls fail with no fallback on symmetric-NAT or otherwise restrictive networks. This is also a hardcoded external URL, which the repo's own conventions otherwise avoid for configuration values.
- `apps/web/src/components/RemoteVideoTile.tsx` (30 lines): renders one remote stream tile per peer.

### Documented as the current, deliberate baseline

`docs/features/voice-webrtc.md` currently lists, under Out of Scope: "SFU (Selective Forwarding Unit) media server infrastructure (mesh P2P signaling is used for baseline)." Its Trade-offs section chose "Full Mesh P2P for baseline implementation" with the stated cost: "High client bandwidth and CPU usage for voice channels with more than 4-6 active video streams." Its Deployment Notes mention configuring STUN/TURN env vars (which, per the current code, is not actually wired up on the client — the STUN URL is hardcoded). **This doc supersedes that baseline decision and updates `docs/features/voice-webrtc.md` in place** when implemented — it is not forked into a separate spec.

`docs/features/dm-calls.md` covers DM ringing on top of the same voice gateway and `CallRegistryService`; its ringing protocol, call keys, and UI are unaffected by moving from mesh to SFU media transport, but its "Current Behavior" section references the same mesh-relay events and must be checked for accuracy once the SFU signaling path replaces `webrtc:offer`/`answer`/`ice-candidate`.

### Bandwidth math (mesh vs. SFU)

This is an arithmetic estimate from stream count, **not a measurement taken in this repo** — no load test or bandwidth profiling exists here today.

- Full mesh, N participants each publishing one ~1.5 Mbps video stream: every client holds N-1 peer connections and uploads its own stream N-1 times. At N=6, that is roughly 7.5 Mbps of upload per client.
- With an SFU, each client uploads its stream once (~1.5 Mbps) regardless of N, and downloads up to N-1 streams (the SFU may adapt per-subscriber quality, which this doc does not design beyond the chosen SDK's default).

## Changes

### Rules / Flow

1. **Media path**: clients no longer open a `RTCPeerConnection` per remote participant. Each client opens one connection to the SFU, publishes its local track(s), and subscribes to the tracks the SFU forwards for other participants in the same call.
2. **Authorization stays server-side and unchanged in intent**: `voice:join` still calls `access.authorizeCallJoin` before anything else. On success, instead of (or in addition to) returning the existing-participant list for peer-to-peer offer setup, the API mints an SFU access token/credential (room name = `channelId` or the existing DM call key) and returns it to the client alongside the existing `{ participants }` shape, so the UI's existing participant list rendering keeps working unchanged.
3. **`CallRegistryService` keeps its role as the source of truth for who is in a call** (membership, mute/camera/screen-share state, `ActiveCallSummary`) — that bookkeping is unchanged by this doc, because it is metadata, not media transport. It also keeps depending on `realtime-scale-out.md`'s Redis-backed membership so authorization and active-call summaries are correct across instances.
4. **`webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` and `assertPeer`**: with an SFU, clients no longer negotiate directly with each other, so peer-to-peer signaling relay between two client sockets is no longer needed for the base call flow. The concrete disposition (remove entirely vs. repurpose for client-to-SFU signaling) depends on the chosen SDK's own signaling protocol — most SFU SDKs (mediasoup, LiveKit) define their own client-to-server signaling and do not reuse raw `RTCPeerConnection` offer/answer between clients. This doc recommends **removing** these three events and `assertPeer` once the SFU signaling path is proven, and flags the removal as a breaking change to the realtime event contract (see Deployment Notes) rather than deciding the exact replacement signaling shape here — that is dictated by whichever SDK is chosen and should be detailed in a follow-up implementation doc once the SDK decision is made.
5. **TURN**: the client's hardcoded `iceServers` array is replaced by ICE server configuration served from the API (or supplied by the SFU SDK's own client library, which typically handles ICE/TURN internally). A TURN server (self-hosted `coturn`, or the SFU vendor's bundled TURN) is required, since restrictive-NAT clients cannot reach a media server without one.
6. **`voice:state`, `voice:active`, `dm:call:*` contracts**: unchanged. They describe call membership and per-participant UI state (mute, camera, screen-share), which remains `CallRegistryService`'s responsibility regardless of the media transport underneath.

### Edge cases

| Case                                                                | Expected behavior                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SFU unreachable when a client tries to join                         | `voice:join` fails with a clear error before the client attempts media setup; existing `authorizeCallJoin` failure handling pattern is followed for consistency.                                                                    |
| A participant already in-call when the SFU restarts                 | Existing publish/subscribe sessions to that SFU instance drop; client must detect the SFU connection loss and attempt to rejoin — this reconnection behavior is SDK-specific and must be validated against whichever SDK is chosen. |
| Empty channel / no other participants                               | Unchanged from today: a lone joiner still gets `{ participants: [] }` and simply publishes with no subscribers yet.                                                                                                                 |
| More participants than the SFU's own configured room limit (if any) | Out of scope for this doc to define a number — record whatever ceiling the chosen SDK enforces by default; do not invent one.                                                                                                       |
| Unauthorized join attempt                                           | Unchanged: rejected by `access.authorizeCallJoin` before any SFU token is issued.                                                                                                                                                   |

## Technical Approach

**Files touched**

| File                                                                                                                            | Change                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/realtime/voice.gateway.ts`                                                                                | `voice:join` mints and returns an SFU access token in addition to today's participant list; `webrtc:offer`/`answer`/`ice-candidate` handlers removed once the SFU signaling path is confirmed working.                   |
| `apps/api/src/modules/realtime/call-registry.service.ts`                                                                        | `assertPeer` removed if no longer needed by any remaining handler; `CallParticipant`/`ActiveCallSummary` shapes unchanged.                                                                                               |
| `apps/api/src/modules/realtime/realtime-access.service.ts`                                                                      | `authorizeCallJoin` reused as-is ahead of token issuance; no signature change expected.                                                                                                                                  |
| New: an SFU client/token module in `apps/api/src/modules/realtime/` (name depends on chosen SDK, e.g. a `voice-sfu.service.ts`) | Wraps the SDK's server-side room/token API behind one module, following the repo's existing pattern of one wrapper module per external integration.                                                                      |
| `apps/web/src/hooks/useChannelCall.ts`                                                                                          | `peersRef` mesh replaced with the SDK's client room/connection object; media capture (`getUserMedia`/`getDisplayMedia`) unchanged; ICE/TURN config now comes from the server or the SDK client, not a hardcoded literal. |
| `apps/web/src/components/RemoteVideoTile.tsx`                                                                                   | Track source changes from a raw `RTCPeerConnection` remote stream to whatever subscription object the SDK's client library exposes; rendering contract (one tile per remote participant) is unchanged.                   |
| `docs/features/voice-webrtc.md`                                                                                                 | Updated in place: Scope, Current Behavior, Trade-offs, Deployment Notes rewritten for the SFU architecture; this is the same file, not a fork.                                                                           |
| `docs/features/dm-calls.md`                                                                                                     | Current Behavior section's references to mesh signaling events checked and updated to match whatever the SDK's signaling path ends up being.                                                                             |
| `docker-compose.yml` / production deployment config                                                                             | New SFU service or third-party endpoint configuration (see Deployment Notes — this is a real infrastructure change, not just a code change).                                                                             |

**Libraries** — see Trade-offs for the vendor decision; no library is pinned here until that decision is made, to avoid the doc prescribing an implementation ahead of its own recommendation section.

## Trade-offs

| Option                                             | Pros                                                                                                                                                                                                                    | Cons                                                                                                                                                                                                                                                                                                                                                               | Verdict                                                                                                                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-hosted mediasoup**                          | Full control over media pipeline; no per-minute/per-participant vendor cost; runs alongside the existing NestJS API as a Node process, so the team's existing TypeScript/Node skillset applies directly                 | Mediasoup gives low-level primitives (routers, transports, producers/consumers) with no built-in room/participant/reconnection model — a meaningful custom layer must be built and maintained on top of it; the operator is fully responsible for scaling, monitoring, and the UDP media plane; rewrites essentially all of `useChannelCall.ts`'s connection logic | Most control, most engineering cost — reasonable only if a dedicated media-infrastructure owner exists                                                                                                                            |
| **Self-hosted LiveKit**                            | Open-source, provides a full room/participant/reconnection model (not just raw primitives like mediasoup), has a mature TypeScript client SDK, can be self-hosted in Docker/Kubernetes with a documented UDP port range | Still a new service to operate, patch, and monitor; still needs a public IP and UDP port range reachable from clients, which does not fit the current single-container `docker-compose.yml` / typical PaaS-web-dyno model (see Deployment Notes)                                                                                                                   | **Recommended**: closest match to "rewrite `useChannelCall.ts` once, get a maintained client SDK and server room model," at the cost of still owning the operational burden                                                       |
| **Managed LiveKit Cloud (or equivalent SaaS SFU)** | No media-server operations at all; same client SDK as self-hosted LiveKit, so the client-side rewrite cost is identical to the self-hosted option; scales without the team provisioning UDP-reachable infrastructure    | Recurring per-participant-minute cost with no in-repo precedent for that kind of spend; introduces a third-party dependency for a core feature (voice/video), which needs its own outage/degradation handling; credentials must never be logged (per `rules/security.md`)                                                                                          | Second choice: same client-side cost as self-hosting LiveKit, but removes the "does our host support a UDP port range" deployment blocker — a strong option if the budget question in `open-questions.md` is answered "yes, sure" |
| Keep full mesh, just fix STUN/TURN                 | Zero new infrastructure; smallest possible change                                                                                                                                                                       | Does not address the actual goal (participant ceiling); TURN alone does not fix the N-1 upload bandwidth problem that motivates this doc                                                                                                                                                                                                                           | Ruled out: fixes a real bug (no TURN) but not the stated goal, and is cheap enough to do independently of this doc if the ceiling problem is deprioritized                                                                        |

**Recommendation**: self-hosted LiveKit if there is an infra owner willing to run a stateful media service with an open UDP range; managed LiveKit Cloud if there is budget and the deployment target (see `open-questions.md`: does production support a UDP port range) cannot accommodate self-hosting. Either LiveKit option rewrites the same portion of `useChannelCall.ts` and costs the same on the client side — the decision is purely an operations/budget one, not an engineering one, which is why it is left open pending the budget and infrastructure questions in `open-questions.md` rather than decided in this doc.

**What the chosen option costs**: this is the largest change to the repo's realtime surface to date — it touches the client media pipeline (`useChannelCall.ts`), the server signaling contract (`voice.gateway.ts`), and requires new infrastructure (an SFU, reachable over UDP, plus TURN). It also carries a real deployment-model consequence: neither self-hosted option fits the current one-container-per-service `docker-compose.yml` model or a typical PaaS web dyno (Vercel/Render-style platforms do not expose arbitrary UDP port ranges), so production hosting needs to change regardless of which self-hosted option is picked.

## Risks & Rollback

- **What can break**: this is the largest single change to the realtime surface in the repo; a regression here breaks every voice/video call and every DM call, not just a slice of functionality.
- **New operational burden**: a media server (self-hosted) is a new stateful service to monitor, patch, and scale — distinct in kind from the API's existing stateless-per-request model.
- **Not covered**: this doc does not solve multi-region media routing, recording, or PSTN; it also inherits `realtime-scale-out.md`'s open item that Redis itself is a new single point of failure, since call authorization still runs through that layer.
- **Rollback**: keep the mesh implementation (`useChannelCall.ts`'s current `RTCPeerConnection`-per-peer code path and `voice.gateway.ts`'s `webrtc:offer`/`answer`/`ice-candidate` handlers) behind a feature flag for at least one release rather than deleting it in the same change that ships the SFU path, so a broken SFU rollout can flip back to mesh without a code revert under incident pressure. Once the SFU path is proven in production for a release cycle, remove the mesh code and update `docs/features/voice-webrtc.md` to drop the flag and the mesh description entirely.

## Test Plan

**Automated**

- Not covered by automated tests per `RULE.md:78` (this repo forbids `*.test.ts`/`*.spec.ts` files and test runners). Verify with `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run docs:check`.

**Manual**

1. Join a voice channel with 2 participants: confirm audio/video works exactly as it does today from the user's perspective (this validates the SFU path did not regress the baseline case the mesh already handled).
2. Join a voice channel with 8+ participants (more than the mesh's practical ceiling): confirm audio/video remains usable for all participants, and each client's outbound upload bandwidth stays roughly constant (one stream) rather than growing with participant count.
3. Toggle mute, camera, and screen-share mid-call: confirm `voice:state` / `voice:user-updated` broadcasts and the UI (`RemoteVideoTile`, call controls) behave identically to the pre-SFU mesh version.
4. From a client on a restrictive/symmetric-NAT network (or a simulated one), confirm the call connects via TURN instead of failing silently as it does today with the hardcoded STUN-only config.
5. Start and answer a DM call (`dm:call:ring` / `decline` / `cancel` flow from `docs/features/dm-calls.md`) end to end: confirm ringing, acceptance, and the resulting call media all work unchanged from the user's perspective.
6. Kill the SFU process mid-call: confirm the client surfaces a clear "call disconnected" state rather than a silent hang, and that rejoining works once the SFU is back.
7. With the rollback flag flipped back to mesh: confirm a 2-3 participant call still works via the original `RTCPeerConnection` path, proving the rollback path is real and not just theoretical.

## Deployment Notes

- New infrastructure: an SFU media server reachable over a UDP port range from clients, plus a TURN server. Neither fits the current single-container `docker-compose.yml` model (one `api`, one `web`, one `postgres`) or a typical PaaS web dyno — this requires a deployment target change (a VM/container platform that allows exposing a UDP range and a public IP), which must be decided and provisioned before this ships to production.
- New env vars: SFU endpoint/API credentials and TURN server credentials (exact names depend on the chosen SDK — add to `.env.example` (repo root) with dummy values once the SDK is picked).
- Breaking API/event-contract change: removing `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` (if that is the final disposition per Changes §4) requires the frontend and backend to ship together — this cannot be a backend-only or frontend-only deploy.
- `docs/features/voice-webrtc.md` and `docs/features/dm-calls.md` updated in place in the same change that ships this.
- Deploys only after [`realtime-scale-out.md`](./realtime-scale-out.md) ships, per the dependency stated at the top of this doc.
- Rollback flag (see Risks & Rollback) must be removed, and the mesh code deleted, in a separate follow-up once the SFU path is proven — not silently left in place indefinitely.
