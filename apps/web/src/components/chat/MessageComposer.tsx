import { useState } from 'react';
import {
  FileAudio2,
  FileText,
  Image,
  Loader2,
  Mic,
  Paperclip,
  Reply,
  Send,
  Slash,
  SmilePlus,
  Square,
  X,
} from 'lucide-react';
import { Channel } from '../../api';
import { formatBytes } from '../../helpers';
import { Button, IconButton, PopoverContent, PopoverRoot, PopoverTrigger, TextField } from '../ui';
import { EmojiPicker } from './EmojiPicker';
import styles from './MessageComposer.module.css';
import { cn } from '../../utils/cn';
import { getSlashCommandSuggestions, parseSlashCommand } from '../../utils/slashCommands';
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
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const isMessageSending = composer.pendingAction === 'send-message';
  const { disabledReason, slowmodeSeconds, retryAfterSeconds } = composer.restriction;
  const isComposerDisabled = !channel || isMessageSending || Boolean(disabledReason);
  const placeholder = !channel
    ? 'Select a channel'
    : disabledReason
      ? disabledReason
      : retryAfterSeconds > 0
        ? `Slowmode is enabled. Wait ${retryAfterSeconds}s`
        : slowmodeSeconds > 0
          ? `Message #${channel.name} (slowmode ${slowmodeSeconds}s)`
          : `Message #${channel.name}, type / for commands`;
  const commandSuggestions = getSlashCommandSuggestions(composer.draft).slice(0, 4);
  const parsedCommand = parseSlashCommand(composer.draft);

  return (
    <form onSubmit={composer.sendMessage} className={styles.composer}>
      {composer.replyingToMessage && (
        <div className={styles.composerReply} data-testid="composer-reply">
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

      {commandSuggestions.length > 0 && (
        <div className={styles.commandPopover} role="listbox" aria-label="Slash command suggestions">
          {commandSuggestions.map((command) => (
            <button
              type="button"
              key={command.name}
              className={styles.commandOption}
              onClick={() => composer.setDraft(`/${command.name} `)}
            >
              <Slash size={14} aria-hidden="true" />
              <span>
                <strong>/{command.name}</strong>
                <small>{command.description}</small>
              </span>
              <code>{command.usage}</code>
            </button>
          ))}
          {parsedCommand.error ? <div className={styles.commandError}>{parsedCommand.error}</div> : null}
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
        data-testid="composer-file-input"
        type="file"
        multiple
        accept="image/*,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm,application/pdf,text/plain,application/zip,.zip"
        onChange={composer.selectFiles}
        disabled={isComposerDisabled}
      />

      <IconButton
        label="Attach file"
        className={styles.attachButton}
        onClick={() => composer.fileInputRef.current?.click()}
        disabled={isComposerDisabled}
      >
        <Paperclip size={18} aria-hidden="true" />
      </IconButton>

      <IconButton
        label={composer.isRecordingVoice ? 'Stop voice message' : 'Record voice message'}
        className={cn(styles.voiceRecordButton, composer.isRecordingVoice && styles.recording)}
        onClick={composer.isRecordingVoice ? composer.stopVoiceRecording : composer.startVoiceRecording}
        disabled={
          !channel || Boolean(disabledReason) || (isMessageSending && !composer.isRecordingVoice)
        }
      >
        {composer.isRecordingVoice ? <Square size={15} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </IconButton>

      <PopoverRoot open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
        <PopoverTrigger asChild>
          <IconButton
            label="Insert emoji"
            className={styles.attachButton}
            disabled={isComposerDisabled}
          >
            <SmilePlus size={18} aria-hidden="true" />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent side="top" align="start">
          <EmojiPicker
            onSelect={(emoji) => {
              const separator = composer.draft && !composer.draft.endsWith(' ') ? ' ' : '';
              composer.setDraft(`${composer.draft}${separator}${emoji} `);
              setIsEmojiOpen(false);
            }}
          />
        </PopoverContent>
      </PopoverRoot>

      <TextField
        name="content"
        className={styles.composerInput}
        data-testid="composer-input"
        value={composer.draft}
        placeholder={placeholder}
        disabled={isComposerDisabled}
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
        disabled={isComposerDisabled || retryAfterSeconds > 0}
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
