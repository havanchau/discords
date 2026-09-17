import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { VOICE_MESSAGE_MAX_DURATION_MS, type VoiceAttachmentMetadata } from '@discord-clone/shared';
import { useTranslation } from '@/i18n/LocaleProvider';
import { analyzeVoiceRecording } from '@/utils/voiceRecording';

/** Where the composer sends: a server channel or a direct conversation. */
export interface ComposerDestination {
  type: 'channel' | 'conversation';
  id: string;
}

interface UseComposerAttachmentsOptions {
  destination: ComposerDestination | null;
  /** `voice` is null when the browser could not decode the recording; it is then a plain audio file. */
  sendVoiceMessage: (file: File, voice: VoiceAttachmentMetadata | null) => Promise<unknown>;
  setWorkspaceError: (message: string | null) => void;
}

export function useComposerAttachments({
  destination,
  sendVoiceMessage,
  setWorkspaceError,
}: UseComposerAttachmentsOptions) {
  const t = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const cancelVoiceRecordingRef = useRef(false);
  const voiceLimitTimerRef = useRef<number | null>(null);
  const destinationId = destination ? `${destination.type}:${destination.id}` : null;

  // Leaving the channel or conversation (or unmounting) discards an unfinished recording, so it is
  // never sent to whatever destination is open when the recorder finally stops.
  useEffect(
    () => () => {
      cancelVoiceRecordingRef.current = true;
      if (voiceLimitTimerRef.current !== null) window.clearTimeout(voiceLimitTimerRef.current);
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [destinationId],
  );

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setSelectedFiles((current) => [...current, ...files].slice(0, 6));
    event.target.value = '';
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function startVoiceRecording() {
    if (!destination) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setWorkspaceError(t('voice.notSupported'));
      return;
    }

    try {
      setWorkspaceError(null);
      cancelVoiceRecordingRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = new MediaRecorder(
        stream,
        supportedMimeType ? { mimeType: supportedMimeType } : undefined,
      );

      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (voiceLimitTimerRef.current !== null) {
          window.clearTimeout(voiceLimitTimerRef.current);
          voiceLimitTimerRef.current = null;
        }
        const chunks = voiceChunksRef.current;
        const recordedType = recorder.mimeType || supportedMimeType || 'audio/webm';
        const uploadType = recordedType.split(';')[0] || 'audio/webm';
        const blob = new Blob(chunks, { type: uploadType });
        const shouldSend = !cancelVoiceRecordingRef.current && blob.size > 0;
        voiceChunksRef.current = [];
        voiceRecorderRef.current = null;
        setIsRecordingVoice(false);
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;

        if (!shouldSend) return;

        const extension = uploadType.includes('mp4')
          ? 'm4a'
          : uploadType.includes('ogg')
            ? 'ogg'
            : 'webm';
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, {
          type: uploadType,
        });
        void analyzeVoiceRecording(blob).then((voice) => sendVoiceMessage(file, voice));
      };

      recorder.onerror = () => {
        setWorkspaceError(t('voice.recordingFailed'));
        cancelVoiceRecordingRef.current = true;
        setIsRecordingVoice(false);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecordingVoice(true);
      // The cap is silent: the recording stops and sends what was captured up to the limit.
      voiceLimitTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, VOICE_MESSAGE_MAX_DURATION_MS);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-start-voice-recording'),
      );
    }
  }

  function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }

  return {
    selectedFiles,
    setSelectedFiles,
    isRecordingVoice,
    fileInputRef,
    selectFiles,
    removeSelectedFile,
    startVoiceRecording,
    stopVoiceRecording,
  };
}
