import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AuthState, Channel } from '../api';

interface UseComposerAttachmentsOptions {
  auth: AuthState | null;
  channel: Channel | null;
  sendChatMessage: (content: string, files: File[]) => Promise<unknown>;
  setWorkspaceError: (message: string | null) => void;
}

export function useComposerAttachments({
  auth,
  channel,
  sendChatMessage,
  setWorkspaceError,
}: UseComposerAttachmentsOptions) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const cancelVoiceRecordingRef = useRef(false);

  useEffect(
    () => () => {
      cancelVoiceRecordingRef.current = true;
      if (voiceRecorderRef.current?.state !== 'inactive') {
        voiceRecorderRef.current?.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
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
    if (!auth || !channel) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setWorkspaceError('Voice recording is not supported in this browser.');
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
        void sendChatMessage('', [file]);
      };

      recorder.onerror = () => {
        setWorkspaceError('Voice recording failed. Check microphone permission and try again.');
        cancelVoiceRecordingRef.current = true;
        setIsRecordingVoice(false);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecordingVoice(true);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot start voice recording');
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
