# Feature Spec: Voice Messages

Turns the existing composer voice recorder into a real voice-message type: a bounded recording, a true waveform, duration shown before playback, and support in DMs where recording does not work today.

## Goal

A member holds the mic button, records up to a fixed duration, and sends a voice note that plays back with its actual duration and a waveform generated from the recording — in both channels and DMs.

Acceptance criteria:

- Recording is capped at a fixed maximum duration (see Rules) and rejects/cuts off silently past it rather than uploading an oversized file.
- The upload carries `durationMs` and a `waveform` (peak samples) alongside the existing file metadata, validated server-side.
- A voice message attachment renders its real duration and a waveform derived from the recording, not the current static decorative bars.
- Recording and sending a voice message works from a DM composer, not just a channel composer.
- An unsupported browser (no `MediaRecorder`) gets the existing clear error instead of a broken button.

## Scope

- **In scope**: duration and waveform metadata end to end (record → upload → validate → store → render), a voice-specific max duration/size, enabling voice recording in the DM composer, a dedicated voice-message player replacing the generic `<audio>` + fake waveform block.
- **Out of scope**: transcription, playback speed control, re-recording in place, voice messages inside threads (threads reuse the channel composer's attachment path already, so they are covered once the channel composer changes, but are not separately verified here), server-side audio transcoding.

## Current Behavior

- Voice recording already exists, but only in the channel composer: `useComposerAttachments.startVoiceRecording` (`apps/web/src/hooks/useComposerAttachments.ts:48-89`) guards on `if (!auth || !channel) return`, so the hook does nothing without an open channel. It records via `MediaRecorder`, picks the first supported MIME type from `['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']` (`useComposerAttachments.ts:59-63`), and on stop builds a `File` and calls `sendChatMessage('', [file])` (`useComposerAttachments.ts:91-101`) — no duration or waveform is captured anywhere in this flow.
- The channel composer wires the mic button through `MessageComposer.tsx:153-166`, disabled when `!channel` (`:159`). The DM composer, `DirectMessageComposer.tsx`, has a file picker (added by [forward-message.md](forward-message.md)) but no recording UI.
- `DirectMessageAttachment` and `CreateDirectMessageDto.attachments` already exist, added by [forward-message.md](forward-message.md) (migration `20260917002000_add_message_forwarding`), so DMs can carry files; neither attachment table has voice metadata.
- Upload validation allows `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm` by MIME sniff and extension (`apps/api/src/modules/uploads/uploads.service.ts:12-21`), enforced against the generic `UPLOAD_MAX_BYTES` (100 MB in the documented env, `docs/deployment.md`; the code fallback at `apps/api/src/modules/uploads/uploads.controller.ts:22` is 10 MB) — there is no voice-specific, shorter limit.
- `MessageAttachment` stores only `fileName`, `mimeType`, `byteSize`, `url` (`apps/api/prisma/schema.prisma:407-416`); `MessageAttachmentInputDto` validates the same four fields plus nothing else (`apps/api/src/modules/messages/dto/create-message.dto.ts`) — no field exists for duration or waveform.
- Playback renders every audio attachment with a plain `<audio controls>` and 18 fixed `<i>` bars that carry no data (`apps/web/src/components/chat/MessageRow.tsx:198-219`, the bars are `Array.from({ length: 18 }, ...)` with no binding to the file) — the "waveform" seen today is decorative, not derived from the recording, and there is no duration label anywhere in that block.

## Changes

### Rules

- Recording stops automatically at a fixed `MAX_VOICE_MESSAGE_MS` (5 minutes), enforced client-side by a timer that calls the existing `stopVoiceRecording` path; the server independently rejects any voice attachment with `durationMs > 300_000` regardless of what the client sent, since client-reported duration is not trusted for enforcement, only for display.
- Voice attachments get a server-side size ceiling of `VOICE_MAX_BYTES` (25 MB, comfortably above 5 minutes of Opus/AAC at typical bitrates) — smaller than the generic `UPLOAD_MAX_BYTES`, checked in addition to it, not instead of it.
- `durationMs` (integer, 1–300000) and `waveform` (array of 20–100 integers, 0–100, representing normalized peak amplitude buckets) are required on the attachment payload when the attachment is flagged as a voice message (`kind: 'voice'`), and a voice attachment's `mimeType` must start with `audio/`; a regular audio file upload (e.g., an MP3 shared as a file) keeps working without them. `durationMs`/`waveform` sent on an attachment without `kind: 'voice'` are dropped, not stored.
- The limits live once in `packages/shared/src/voice-messages.ts` and are imported by both the recorder and the API.
- A forwarded voice message keeps its voice metadata; the destination's send path re-validates it like any send.
- If the browser cannot decode its own recording (so no real duration/waveform can be measured), the file is sent as a plain audio attachment without `kind`, rather than with invented metadata.
- Switching channel or conversation (or unmounting the composer) while recording discards the unfinished recording instead of sending it to whichever destination is open when it stops.
- The DM composer gains the same recording capability as the channel composer, subject to the same DM write checks that already gate a DM send (conversation membership, block check) — no new permission concept.
- Waveform peaks are computed client-side from the recorded `AudioBuffer` (via `OfflineAudioContext`/`decodeAudioData`, already available in every browser that supports `MediaRecorder`) at record-stop time, sent as part of the upload request; the server validates shape and range only, it does not recompute audio from the file.

### Client

- `useComposerAttachments` drops the `auth`/`channel` options in favor of `destination: { type: 'channel' | 'conversation'; id: string } | null` and a `sendVoiceMessage(file, voice)` callback, so the same hook backs both composers; a max-duration timer stops the recorder automatically at `VOICE_MESSAGE_MAX_DURATION_MS`.
- On `recorder.onstop` the hook calls `analyzeVoiceRecording` (`utils/voiceRecording.ts`), which decodes the blob with `OfflineAudioContext.decodeAudioData` and returns `durationMs` plus 48 peak buckets, then calls `sendVoiceMessage` with the `File` and that metadata.
- `uploadMessageAttachments(files, token, voice?)` (`api.ts`) uploads the files and merges the voice metadata into the returned attachment; the channel send (`AppShell.sendChatMessage`) and the DM sends (`useDirectMessages`) both use it.
- `DirectMessageComposer.tsx` gets the same mic button `MessageComposer.tsx` already has and now takes its file selection and recording from `useComposerAttachments` instead of local state. Voice notes go through a new `sendDirectVoiceMessage(file, voice)` in `useDirectMessages`, which does not clear the typed draft; errors surface through `reportComposerError` (the workspace error setter).
- `MessageAttachments` (`components/chat/MessageAttachments.tsx`, the renderer shared by channel and DM rows since forward-message) gets a voice branch, checked before the generic `audio` branch, rendering `VoiceMessagePlayer`: play/pause, a waveform built from the real `waveform` array with played bars highlighted, and an `m:ss` label (duration, or position while playing). A non-voice audio file, or a voice row missing metadata, keeps the existing generic player.

## Technical Approach

### Data model

```prisma
model MessageAttachment {
  // ...existing fields
  kind       String?  // 'voice' when it is a recorded voice message, otherwise null
  durationMs Int?
  waveform   Json?    // number[] of 20-100 peak buckets, 0-100
}

model DirectMessageAttachment {
  // ...existing fields (table created by forward-message.md)
  kind       String?
  durationMs Int?
  waveform   Json?
}
```

Migration `20260917003000_add_voice_messages` adds only the three nullable columns to both tables: `DirectMessageAttachment` already exists from forward-message (`20260917002000_add_message_forwarding`).

### API

- `MessageAttachmentInputDto` (`create-message.dto.ts`) gains `kind?: 'voice'`, `durationMs?: number` (`@IsInt @Min(1) @Max(300000)`), `waveform?: number[]` (`@ArrayMinSize(20) @ArrayMaxSize(100)`, each `@IsInt @Min(0) @Max(100)`). `CreateDirectMessageDto.attachments` already reuses this class.
- The decorators alone are not enough: the channel composer normally sends over the socket `message:create` event (`apps/api/src/modules/realtime/messages.gateway.ts`), which passes attachments to `MessagesService.createMessage` without the validation pipe. So `toAttachmentCreateData` (`apps/api/src/modules/messages/message-attachments.ts`) re-checks every voice attachment in full in `MessagesService.createMessage`, `createThreadMessage` and `DirectMessagesService.createMessage`, and rejects with `400`:
  - `Invalid voice message metadata` — `kind` present but not `'voice'`, non-audio MIME, missing/non-integer `durationMs`, or a `waveform` outside 20–100 integers in 0–100;
  - `Voice message is too long` — `durationMs > 300000`;
  - `Voice message is too large` — `byteSize > VOICE_MAX_BYTES`.
    All three are mapped in `common/i18n/error-codes.ts` and both API catalogs.
- `VOICE_MAX_BYTES` is read through `ConfigService` once in each service constructor (default `26214400`); a malformed value fails the boot. `byteSize` is the value the upload endpoint returned to the client — the same trust the existing `@Max(100 MB)` DTO check relies on.
- Responses: the shared `MessageAttachment` gains optional `kind`, `durationMs`, `waveform`; `formatAttachment` returns them only for a complete, valid stored voice row, otherwise `null`.
- Forwarding (`forwarding.service.ts`) selects the voice columns and passes them back through the destination's send path via `toAttachmentInput`.
- No new endpoint: voice messages upload through the existing `POST /uploads` / chunked upload endpoints (`uploads.controller.ts`, per [media-uploads.md](media-uploads.md)) and then send through the existing `POST /channels/:channelId/messages` / `POST /conversations/:conversationId/messages` with the richer attachment payload above.

### Files

- Shared: `packages/shared/src/voice-messages.ts` (new: limits, `VoiceAttachmentMetadata`), `index.ts`, `api-contract.ts` (`MessageAttachment` voice fields).
- API: `prisma/schema.prisma`, `prisma/migrations/20260917003000_add_voice_messages/migration.sql`, `modules/messages/message-attachments.ts` (new: validation, create mapping, formatting, `VOICE_MAX_BYTES`), `modules/messages/dto/create-message.dto.ts`, `messages.service.ts`, `modules/direct-messages/direct-messages.service.ts`, `direct-message.format.ts`, `modules/forwarding/forwarding.service.ts`, `common/i18n/error-codes.ts`, `common/i18n/locales/en.ts`, `vi.ts`.
- Web: `hooks/useComposerAttachments.ts`, `utils/voiceRecording.ts` (new: decode, peaks, `m:ss`), `api.ts` (`uploadMessageAttachments`), `AppShell.tsx` (destination + voice send), `hooks/useDirectMessages.ts` (`sendDirectVoiceMessage`), `hooks/useHomeWorkspace.ts`, `components/home/types.ts`, `components/home/HomeDirectMessageView.tsx`, `components/home/DirectMessageComposer.tsx` (+ `.module.css`), `components/chat/VoiceMessagePlayer.tsx` (+ `.module.css`, new), `components/chat/MessageAttachments.tsx`, `helpers.ts` (`attachmentKind` gains `'voice'`), `i18n/locales/en.ts`, `vi.ts` (`voice.message`, `voice.play`, `voice.pause`, `voice.playbackFailed`). `MessageComposer.tsx` needs no change: it reads the hook's result, not its options.
- Docs: `docs/features/media-uploads.md` and `docs/deployment.md` list `VOICE_MAX_BYTES`. `.env.example` is not edited in this change (see Deployment Notes).

## Trade-offs

- **Client-computed waveform vs. server-side audio analysis**: decoding on the server would need an audio library (`ffmpeg`/`ffprobe` or similar) that is not part of this stack today (`apps/api/package.json` has no audio-processing dependency); the browser already has `MediaRecorder` and `AudioContext` available at record time, so computing peaks client-side avoids a new server dependency. Cost: a malicious or buggy client could send a `waveform` that does not match the actual audio — accepted, since the waveform is decorative, not used for any authorization or business decision, and its shape/range are still validated.
- **A dedicated, smaller `VOICE_MAX_BYTES` vs. reusing `UPLOAD_MAX_BYTES`**: a voice note is a specific, short-lived UX (record-and-send), so a much smaller ceiling (25 MB vs. the generic 100 MB) catches a runaway recording or a spoofed `kind: 'voice'` upload without touching the limit every other upload type relies on.
- **`kind: 'voice'` flag on the general attachment tables vs. a separate `VoiceMessage` table**: a voice note is still fundamentally a message attachment (one file, rendered inline) — giving it its own table would duplicate the file-metadata columns `MessageAttachment` already has for no benefit, since nothing about a voice message needs relations a plain attachment lacks.
- **Reusing `useComposerAttachments` for DMs vs. a separate DM-only recording hook**: the recording/encoding logic (MIME selection, `MediaRecorder` lifecycle, cleanup on unmount) is identical for both destinations; parameterizing the destination is a smaller change than duplicating ~100 lines of recorder state management, and keeps the two composers from drifting on browser-compat handling.

## Risks & Rollback

- **Risk**: `AudioBuffer` decoding for the waveform runs on the main thread at record-stop time; for a 5-minute recording this could cause a brief UI stall on low-end devices — acceptable given the low frequency of the action, but worth profiling if reports come in.
- **Risk**: older recordings created before this change have no `durationMs`/`waveform` (both columns are nullable); the player falls back to the current generic `<audio>` block for any attachment missing them, so nothing in the message history breaks.
- **Risk**: some browsers may fail to decode their own `MediaRecorder` output (for example WebM without a duration header); those recordings are sent as plain audio files, so the voice player will not appear for them. Not verified per browser.
- **Rollback**: revert code; the migration only adds nullable columns, so it can stay in place, or be reverted with `ALTER TABLE ... DROP COLUMN` for `kind`, `durationMs`, `waveform` on both tables (drops stored voice metadata only).

## Test Plan

No automated test suite in this repo (`RULE.md:77`); verified with `npm run typecheck`, `npm run lint`, `npm run build`, plus the manual scenario below.

- **Manual — channel**: record a 10-second voice note in a channel → it uploads, appears with the real duration and a waveform that visibly differs from a second, differently-spoken recording.
- **Manual — DM**: open a DM, record and send a voice note → it appears in the DM with the same player; the other participant can play it back.
- **Failure case**: attempt to record past 5 minutes → recording auto-stops at the cap and sends; separately, `POST /direct-conversations/:id/messages` with an uploaded audio attachment carrying `kind: 'voice'` and no `durationMs` is rejected with `400`, and the same payload over the socket `message:create` event is refused with `Invalid voice message metadata`. A `waveform` of 10 entries, or `durationMs: 300001`, is also rejected.
- **Switching**: start recording in a channel, switch to another channel → the recording stops and nothing is sent.

## Deployment Notes

- Run migration `20260917003000_add_voice_messages` after `20260917002000_add_message_forwarding` and before deploying the API.
- Optional env `VOICE_MAX_BYTES` (default `26214400`), documented in `media-uploads.md` and `deployment.md`. `.env.example` still needs a `VOICE_MAX_BYTES=26214400` line added by hand: the agent's permission settings block reading or editing `.env*` files.
- New `voice.*` i18n keys ship in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
