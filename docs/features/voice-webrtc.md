# Feature Spec: Voice & WebRTC Signaling

This specification covers voice channel occupancy, audio/video state synchronization, and WebRTC peer-to-peer signaling for voice and video communication.

## Goal

Provide real-time voice channel participation, participant state tracking (mute, deafen, speaking, screen-share), and low-latency WebRTC connection setup.

## Scope

- **In Scope**:
  - Voice channel occupancy state management and room join/leave broadcasts.
  - Server-mediated WebRTC signaling (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`).
  - Mute/unmute, deafen/undeafen, and speaking indicator state broadcasts.
  - Web client call UI controls and audio/video rendering grid.
- **Out of Scope**:
  - SFU (Selective Forwarding Unit) media server infrastructure (mesh P2P signaling is used for baseline).
  - Telephony or PSTN integration.

## Current Behavior

- **API & Signaling Gateway**:
  - `apps/api/src/modules/realtime/realtime.gateway.ts`: Authenticates WebRTC signaling messages and proxies offers, answers, and ICE candidates between authorized channel participants.
- **Web Client Call Hooks & Components**:
  - `apps/web/src/hooks/useChannelCall.ts`: Manages local `RTCPeerConnection` instances, media streams (microphone, camera, screen-share), and socket signaling listeners.
  - `apps/web/src/components/RemoteVideoTile.tsx`: Renders remote user video stream tracks and participant status overlays.

## Changes

- Modularized WebRTC signaling payload definitions in `packages/shared`.
- Enforced voice permission checks (`CONNECT`, `SPEAK`, `STREAM`) on the API before forwarding signaling messages.

## Technical Approach

- **Modules & Files**:
  - `apps/api/src/modules/realtime/realtime.gateway.ts`
  - `apps/web/src/hooks/useChannelCall.ts`
  - `apps/web/src/components/RemoteVideoTile.tsx`
  - `packages/shared/src/index.ts`
- **Realtime Event Contracts**:
  - `voice:join` / `voice:leave` -> Channel room subscription.
  - `voice:state` -> Mute, deafen, video, and screen-share status.
  - `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` -> Target user-scoped signaling payloads.

## Trade-offs

- **Full Mesh P2P vs SFU Server Architecture**:
  - *Chosen*: Full Mesh P2P for baseline implementation.
  - *Rationale*: Zero extra backend media server operational cost or third-party SDK dependencies.
  - *Cost*: High client bandwidth and CPU usage for voice channels with more than 4-6 active video streams.

## Risks & Rollback

- **Risks**: NAT traversal failure on restrictive networks without TURN server configuration.
- **Rollback**: Disable WebRTC video/screen-share controls in UI while preserving voice room state tracking.

## Test Plan

- **Automated Tests**:
  - `apps/web/src/hooks/useChannelCall.test.tsx` testing call state machine and track teardown logic.
- **Manual Verification**:
  - Test 2-player and 3-player call flows with microphone mute, camera toggle, and screen share.

## Deployment Notes

- Configure STUN/TURN server environment variables for production WebRTC NAT traversal if deployment crosses NAT boundaries.
