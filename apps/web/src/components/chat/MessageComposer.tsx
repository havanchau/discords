import { ChangeEvent, FormEvent, RefObject } from 'react';
import { FileAudio2, FileText, Image, Loader2, Mic, Paperclip, Reply, Send, Square, X } from 'lucide-react';
import { Channel, Message } from '../../api';
import { formatBytes } from '../../helpers';
import { Button, IconButton, TextField } from '../ui';
import styles from './MessageComposer.module.css';
import { cn } from '../../utils/cn';

interface MessageComposerProps {
  channel: Channel | null;
  replyingToMessage: Message | null;
  selectedFiles: File[];
  isRecordingVoice: boolean;
  pendingAction: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setReplyingToMessage: (message: Message | null) => void;
  removeSelectedFile: (index: number) => void;
  selectFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  sendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleComposerInput: () => void;
}

export function MessageComposer({
  channel,
  replyingToMessage,
  selectedFiles,
  isRecordingVoice,
  pendingAction,
  fileInputRef,
  setReplyingToMessage,
  removeSelectedFile,
  selectFiles,
  startVoiceRecording,
  stopVoiceRecording,
  sendMessage,
  handleComposerInput,
}: MessageComposerProps) {
  const isMessageSending = pendingAction === 'send-message';

  return (
    <form onSubmit={sendMessage} className={styles.composer}>
      {replyingToMessage && (
        <div className={styles.composerReply}>
          <Reply size={14} aria-hidden="true" />
          <span>
            Replying to <strong>{replyingToMessage.author.displayName}</strong>
          </span>
          <IconButton
            label="Cancel reply"
            variant="ghost"
            onClick={() => setReplyingToMessage(null)}
          >
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className={styles.pendingAttachments}>
          {selectedFiles.map((file, index) => {
            const isImage = file.type.startsWith('image/');
            const isAudio = file.type.startsWith('audio/');
            return (
              <Button
                key={`${file.name}-${file.lastModified}-${index}`}
                className={styles.pendingFile}
                onClick={() => removeSelectedFile(index)}
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
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        multiple
        accept="image/*,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip"
        onChange={selectFiles}
        disabled={!channel || isMessageSending}
      />

      <IconButton
        label="Attach file"
        className={styles.attachButton}
        onClick={() => fileInputRef.current?.click()}
        disabled={!channel || isMessageSending}
      >
        <Paperclip size={18} aria-hidden="true" />
      </IconButton>

      <IconButton
        label={isRecordingVoice ? 'Stop voice message' : 'Record voice message'}
        className={cn(styles.voiceRecordButton, isRecordingVoice && styles.recording)}
        onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
        disabled={!channel || (isMessageSending && !isRecordingVoice)}
      >
        {isRecordingVoice ? <Square size={15} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </IconButton>

      <TextField
        name="content"
        className={styles.composerInput}
        data-testid="composer-input"
        placeholder={
          channel ? `Message #${channel.name}, paste a link, or attach media` : 'Select a channel'
        }
        disabled={!channel || isMessageSending}
        onChange={handleComposerInput}
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
