import { FileAudio2, FileText, Image, Loader2, Mic, Paperclip, Reply, Send, Square, X } from 'lucide-react';
import { Channel } from '../../api';
import { formatBytes } from '../../helpers';
import { Button, IconButton, TextField } from '../ui';
import styles from './MessageComposer.module.css';
import { cn } from '../../utils/cn';
import type { ChatPanelComposer, ChatPanelMessageActions } from './types';

interface MessageComposerProps {
  channel: Channel | null;
  composer: ChatPanelComposer;
  messageActions: Pick<ChatPanelMessageActions, 'setReplyingToMessage'>;
}

export function MessageComposer({
  channel,
  composer,
  messageActions,
}: MessageComposerProps) {
  const isMessageSending = composer.pendingAction === 'send-message';

  return (
    <form onSubmit={composer.sendMessage} className={styles.composer}>
      {composer.replyingToMessage && (
        <div className={styles.composerReply}>
          <Reply size={14} aria-hidden="true" />
          <span>
            Replying to <strong>{composer.replyingToMessage.author.displayName}</strong>
          </span>
          <IconButton
            label="Cancel reply"
            variant="ghost"
            onClick={() => messageActions.setReplyingToMessage(null)}
          >
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      )}

      {composer.selectedFiles.length > 0 && (
        <div className={styles.pendingAttachments}>
          {composer.selectedFiles.map((file, index) => {
            const isImage = file.type.startsWith('image/');
            const isAudio = file.type.startsWith('audio/');
            return (
              <Button
                key={`${file.name}-${file.lastModified}-${index}`}
                className={styles.pendingFile}
                onClick={() => composer.removeSelectedFile(index)}
                title="Remove attachment"
              >
                {isImage ? (
                  <Image size={17} aria-hidden="true" />
                ) : isAudio ? (
                  <FileAudio2 size={17} aria-hidden="true" />
                ) : (
                  <FileText size={17} aria-hidden="true" />
                )}
                <span>{file.name}</span>
                <small>{formatBytes(file.size)}</small>
              </Button>
            );
          })}
        </div>
      )}

      <input
        ref={composer.fileInputRef}
        className={styles.fileInput}
        type="file"
        multiple
        accept="image/*,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip"
        onChange={composer.selectFiles}
        disabled={!channel || isMessageSending}
      />

      <IconButton
        label="Attach file"
        className={styles.attachButton}
        onClick={() => composer.fileInputRef.current?.click()}
        disabled={!channel || isMessageSending}
      >
        <Paperclip size={18} aria-hidden="true" />
      </IconButton>

      <IconButton
        label={composer.isRecordingVoice ? 'Stop voice message' : 'Record voice message'}
        className={cn(styles.voiceRecordButton, composer.isRecordingVoice && styles.recording)}
        onClick={composer.isRecordingVoice ? composer.stopVoiceRecording : composer.startVoiceRecording}
        disabled={!channel || (isMessageSending && !composer.isRecordingVoice)}
      >
        {composer.isRecordingVoice ? <Square size={15} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </IconButton>

      <TextField
        name="content"
        className={styles.composerInput}
        data-testid="composer-input"
        value={composer.draft}
        placeholder={
          channel ? `Message #${channel.name}, paste a link, or attach media` : 'Select a channel'
        }
        disabled={!channel || isMessageSending}
        onChange={(event) => {
          composer.setDraft(event.target.value);
          composer.handleInput();
        }}
        autoComplete="off"
      />

      <IconButton
        type="submit"
        label="Send message"
        className={styles.sendButton}
        disabled={!channel || isMessageSending}
        data-testid="composer-send"
      >
        {isMessageSending ? (
          <Loader2 className="spin" size={18} aria-hidden="true" />
        ) : (
          <Send size={18} aria-hidden="true" />
        )}
      </IconButton>
    </form>
  );
}
