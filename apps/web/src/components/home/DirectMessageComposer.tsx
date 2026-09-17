import type { FormEvent } from 'react';
import { FileAudio2, FileText, Image, Mic, Paperclip, Reply, Square, X } from 'lucide-react';
import type { DirectMessage } from '@/api';
import { formatBytes } from '@/helpers';
import { useComposerAttachments } from '@/hooks/useComposerAttachments';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, IconButton, TextField } from '@/components/ui';
import { ScheduledMessagesBar } from '@/components/chat/ScheduledMessagesBar';
import { ScheduleSendButton } from '@/components/chat/ScheduleSendButton';
import { cn } from '@/utils/cn';
import type { HomePanelActions } from './types';
import composerStyles from './DirectMessageComposer.module.css';
import styles from './HomePanel.module.css';

// Same file types as the channel composer (`MessageComposer`); the file limit lives in the shared hook.
const ACCEPTED_FILE_TYPES =
  'image/*,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip';

type DirectMessageComposerProps = {
  conversationId: string;
  placeholderName: string;
  draft: string;
  pendingAction: string | null;
  replyingTo: DirectMessage | null;
  replyingToName: string | null;
  onCancelReply: () => void;
  /** Resolves true once the message was sent, so the selected files can be cleared. */
  onSendDirectMessage: (event: FormEvent<HTMLFormElement>, files: File[]) => Promise<boolean>;
  onDraftChange: (value: string) => void;
  onSendVoiceMessage: HomePanelActions['sendDirectVoiceMessage'];
  onComposerError: HomePanelActions['reportComposerError'];
};

export function DirectMessageComposer({
  conversationId,
  placeholderName,
  draft,
  pendingAction,
  replyingTo,
  replyingToName,
  onCancelReply,
  onSendDirectMessage,
  onDraftChange,
  onSendVoiceMessage,
  onComposerError,
}: DirectMessageComposerProps) {
  const t = useTranslation();
  const {
    selectedFiles,
    setSelectedFiles,
    isRecordingVoice,
    fileInputRef,
    selectFiles,
    removeSelectedFile,
    startVoiceRecording,
    stopVoiceRecording,
  } = useComposerAttachments({
    destination: { type: 'conversation', id: conversationId },
    sendVoiceMessage: onSendVoiceMessage,
    setWorkspaceError: onComposerError,
  });
  const isSending = pendingAction === 'direct-message';
  const destination = { type: 'conversation', id: conversationId } as const;

  async function submit(event: FormEvent<HTMLFormElement>) {
    const sent = await onSendDirectMessage(event, selectedFiles);
    if (sent) setSelectedFiles([]);
  }

  function clearAfterSchedule() {
    onDraftChange('');
    setSelectedFiles([]);
    if (replyingTo) onCancelReply();
  }

  return (
    <div className={styles.composerArea}>
      <ScheduledMessagesBar destination={destination} />
      {replyingTo ? (
        <div className={styles.composerReply} data-testid="direct-composer-reply">
          <Reply size={14} aria-hidden="true" />
          <span>
            {t('composer.replyingTo')}{' '}
            <strong>{replyingToName ?? t('dm.composer.replyFallback')}</strong>
          </span>
          <IconButton label={t('composer.cancelReply')} size="sm" onClick={onCancelReply}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      {selectedFiles.length ? (
        <div className={composerStyles.pendingAttachments}>
          {selectedFiles.map((file, index) => {
            const Icon = file.type.startsWith('image/')
              ? Image
              : file.type.startsWith('audio/')
                ? FileAudio2
                : FileText;
            return (
              <Button
                key={`${file.name}-${file.lastModified}-${index}`}
                variant="ghost"
                className={composerStyles.pendingFile}
                title={t('composer.removeAttachment')}
                aria-label={`${t('composer.removeAttachment')}: ${file.name}`}
                onClick={() => removeSelectedFile(index)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{file.name}</span>
                <small>{formatBytes(file.size)}</small>
              </Button>
            );
          })}
        </div>
      ) : null}
      <form className={styles.composer} onSubmit={(event) => void submit(event)}>
        <input
          ref={fileInputRef}
          className={composerStyles.fileInput}
          data-testid="direct-composer-file-input"
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={selectFiles}
          disabled={isSending}
        />
        <IconButton
          label={t('composer.attachFile')}
          disabled={isSending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={18} aria-hidden="true" />
        </IconButton>
        <IconButton
          label={isRecordingVoice ? t('composer.stopVoice') : t('composer.recordVoice')}
          className={cn(isRecordingVoice && composerStyles.recording)}
          disabled={isSending && !isRecordingVoice}
          onClick={isRecordingVoice ? stopVoiceRecording : () => void startVoiceRecording()}
        >
          {isRecordingVoice ? (
            <Square size={15} aria-hidden="true" />
          ) : (
            <Mic size={18} aria-hidden="true" />
          )}
        </IconButton>
        <TextField
          className={styles.composerInput}
          name="content"
          value={draft}
          placeholder={t('dm.composer.placeholder', { name: placeholderName })}
          autoComplete="off"
          aria-label={t('dm.composer.placeholder', { name: placeholderName })}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && replyingTo) onCancelReply();
          }}
        />
        <ScheduleSendButton
          destination={destination}
          draft={draft}
          files={selectedFiles}
          replyToMessageId={replyingTo?.id}
          disabled={isSending}
          onScheduled={clearAfterSchedule}
        />
        <Button type="submit" disabled={isSending}>
          {t('common.send')}
        </Button>
      </form>
    </div>
  );
}
