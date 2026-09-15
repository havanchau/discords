# Feature Spec: Direct Message Calls

Voice and video calls inside direct conversations, with ringing.

## Goal

A member of a 1-1 or group DM can start a voice or video call; other members see an incoming call they can accept or decline; unanswered calls end as missed.

Acceptance criteria:

- Starting a call rings every other member on all of their connected devices.
- Accepting joins the call through the existing WebRTC mesh; answering on one device stops ringing on the user's other devices.
- Declining a 1-1 call ends the ring for everyone; declining a group call only dismisses it for that user.
- The caller can cancel; after 30 seconds without anyone joining the ring stops and recipients get a "Missed call" notification.
- A 1-1 call cannot ring while a block exists in either direction.
- Non-members cannot join a DM call or relay WebRTC signals into it.

## Scope

- **In scope**: ring/decline/cancel socket events, DM call keys in the voice gateway, incoming call dialog, call buttons and call stage in the DM view.
- **Out of scope**: ringtones, call history, calls on multiple API instances, TURN configuration.

## Current Behavior

- Calls are keyed by `channelId` and `voice:join` requires server membership of that channel (`realtime.gateway.ts:268`).
- `voice:active` / `voice:ended` are emitted to `channel:<id>` rooms (`realtime.gateway.ts:521`).
- `useChannelCall.startCall` always uses the selected channel id (`hooks/useChannelCall.ts:123`) and `CallStage` labels calls with `#channel` (`components/chat/CallStage.tsx`).

## Changes

### Call key

A DM call uses the key `dm:<conversationId>` wherever the gateway and client currently use `channelId`. The payload field name stays `channelId` so the WebRTC relay handlers and `useChannelCall` keep one code path.

- `voice:join` with a `dm:` key authorizes conversation membership (and no block for 1-1) instead of server membership.
- `voice:active` / `voice:ended` for a `dm:` key go to `conversation:<id>`.

### Ringing protocol

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `dm:call:ring` | `{ conversationId, mode: 'voice' \| 'video' }` |
| server → recipients' user rooms | `dm:call:incoming` | `{ conversationId, mode, caller: { id, displayName, avatarUrl } }` |
| client → server | `dm:call:decline` | `{ conversationId }` |
| server → caller's user room | `dm:call:declined` | `{ conversationId, userId }` |
| client → server | `dm:call:cancel` | `{ conversationId }` |
| server → all members' user rooms | `dm:call:ring-stopped` | `{ conversationId, reason: 'answered' \| 'declined' \| 'cancelled' \| 'missed', userId? }` |

Rules:

- `dm:call:ring` requires membership; rate limited to 10 per minute per socket. A ring already pending for the conversation is replaced.
- The server keeps pending rings in memory with a 30 second timer.
- A recipient joining the call (`voice:join` with the key) clears the ring and emits `ring-stopped` with `reason: 'answered'` and that user's id, so their other devices stop ringing.
- 1-1 decline clears the ring (`reason: 'declined'`); group decline emits `dm:call:declined` to the caller and `ring-stopped` only to the decliner's user room.
- Cancel is accepted only from the caller; it clears the ring (`reason: 'cancelled'`) and creates `DM_MISSED_CALL` notifications.
- Timer expiry with nobody joined emits `reason: 'missed'` and creates `DM_MISSED_CALL` notifications for recipients.

### Client

- `useChannelCall.startCall(mode, { callId?, label? })`: `callId` defaults to the selected channel id; `CallState` gains `label` for display; it resolves `false` when the call cannot start (for example, media permission denied).
- The caller joins the call first and only rings when joining succeeded; if the ring is refused the caller leaves the call. Nobody rings for a call the caller could not join.
- `useDirectCall` owns ring state: `incomingCall`, `outgoingCall`, `ring(conversation, mode)`, `accept()`, `decline()`, `cancel()`. Outgoing ring UI ends when a remote participant joins, on `ring-stopped`, or when the caller hangs up.
- `IncomingCallDialog` renders globally in `AuthenticatedWorkspace`.
- DM header gets voice and video call buttons; `CallStage` renders inside the DM view for the active DM call.

## Technical Approach

### Files

- API: `realtime/dm-call-rings.ts` (pending ring store with timers, unit-testable), `realtime.gateway.ts` (events, key authorization), `notifications` reuse.
- Shared: new event constants.
- Web: `hooks/useChannelCall.ts`, `hooks/useDirectCall.ts`, `components/home/IncomingCallDialog.tsx`, `components/home/HomeDirectMessageView.tsx`, `components/chat/CallStage.tsx`, `components/app/AuthenticatedWorkspace.tsx`, `AppShell.tsx` wiring.

## Trade-offs

- **Reusing channel call plumbing with a key prefix vs. a separate DM call gateway**: the WebRTC relay, participant tracking, and client peer logic are identical, so one path avoids duplicating about 300 lines of signaling. Cost: `channelId` in payloads now means "call id"; the prefix is validated server-side so a client cannot address a channel as a DM or the reverse.
- **In-memory rings**: consistent with existing in-memory call participants; a restart drops rings, which the client treats as a missed call.
- **One active call per client**: `useChannelCall` holds one call; starting a DM call while in a channel call is disabled rather than juggling two peer meshes.

## Risks & Rollback

- **Risk**: mesh WebRTC degrades above 4–6 video participants (unchanged from channel calls).
- **Rollback**: revert code; no schema change.

## Test Plan

- **Automated**: unit tests for `dm-call-rings.ts` (replace, clear, timeout callback); `useDirectCall` state transitions with a fake socket.
- **Manual**: two browsers → A rings B (voice) → B sees dialog → accept → both in call; A rings B → B declines → A sees declined; A rings and cancels → B gets missed call notification; group of three → one declines, another accepts.

## Deployment Notes

- No migration and no new environment variables.
