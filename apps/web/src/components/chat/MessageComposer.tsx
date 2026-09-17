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
  Sticker,
  X,
} from 'lucide-react';
import { Channel } from '@/api';
import { formatBytes } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import {
  Button,
  IconButton,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  TextField,
} from '@/components/ui';
import { EmojiPicker } from './EmojiPicker';
import { StickerPicker } from './StickerPicker';
import styles from './MessageComposer.module.css';
import { ScheduledMessagesBar } from './ScheduledMessagesBar';
import { ScheduleSendButton } from './ScheduleSendButton';
import { cn } from '@/utils/cn';
import { getSlashCommandSuggestions, parseSlashCommand } from '@/utils/slashCommands';
import type { ChatPanelComposer, ChatPanelMessageActions } from './types';

interface MessageComposerProps {
  channel: Channel | null;
  composer: ChatPanelComposer;
  messageActions: Pick<ChatPanelMessageActions, 'setReplyingToMessage'>;
  /** Scheduling is not offered here: the server would post the draft as plain text. */
  isChannelEncrypted: boolean;
}

export function MessageComposer({
  channel,
  composer,
  messageActions,
  isChannelEncrypted,
}: MessageComposerProps) {
  const t = useTranslation();
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isStickerOpen, setIsStickerOpen] = useState(false);
  const isMessageSending = composer.pendingAction === 'send-message';
  const { disabledReason, slowmodeSeconds, retryAfterSeconds } = composer.restriction;
  const isComposerDisabled = !channel || isMessageSending || Boolean(disabledReason);
  const placeholder = !channel
    ? t('composer.placeholder.selectChannel')
    : disabledReason
      ? disabledReason
      : retryAfterSeconds > 0
        ? t('composer.placeholder.slowmodeWait', { seconds: retryAfterSeconds })
        : slowmodeSeconds > 0
          ? t('composer.placeholder.slowmode', { channel: channel.name, seconds: slowmodeSeconds })
          : t('composer.placeholder.default', { channel: channel.name });
  const commandSuggestions = getSlashCommandSuggestions(composer.draft).slice(0, 4);
  const parsedCommand = parseSlashCommand(composer.draft);

  return (
    <form onSubmit={(event) => void composer.sendMessage(event)} className={styles.composer}>
      {channel ? (
        <ScheduledMessagesBar
          destination={{ type: 'channel', id: channel.id }}
          className={styles.scheduledBar}
        />
      ) : null}

      {composer.replyingToMessage && (
        <div className={styles.composerReply} data-testid="composer-reply">
          <Reply size={14} aria-hidden="true" />
          <span>
            {t('composer.replyingTo')}{' '}
            <strong>{composer.replyingToMessage.author.displayName}</strong>
          </span>
          <IconButton
            label={t('composer.cancelReply')}
            variant="ghost"
            onClick={() => messageActions.setReplyingToMessage(null)}
          >
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      )}

      {commandSuggestions.length > 0 && (
        <div
          className={styles.commandPopover}
          role="listbox"
          aria-label={t('composer.commandSuggestions')}
        >
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
                <small>{t(command.descriptionKey)}</small>
              </span>
              <code>{command.usage}</code>
            </button>
          ))}
          {parsedCommand.errorKey ? (
            <div className={styles.commandError}>
              {t(parsedCommand.errorKey, parsedCommand.errorVars)}
            </div>
          ) : null}
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
                title={t('composer.removeAttachment')}
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
        label={t('composer.attachFile')}
        className={styles.attachButton}
        onClick={() => composer.fileInputRef.current?.click()}
        disabled={isComposerDisabled}
      >
        <Paperclip size={18} aria-hidden="true" />
      </IconButton>

      <IconButton
        label={composer.isRecordingVoice ? t('composer.stopVoice') : t('composer.recordVoice')}
        className={cn(styles.voiceRecordButton, composer.isRecordingVoice && styles.recording)}
        onClick={
          composer.isRecordingVoice ? composer.stopVoiceRecording : composer.startVoiceRecording
        }
        disabled={
          !channel || Boolean(disabledReason) || (isMessageSending && !composer.isRecordingVoice)
        }
      >
        {composer.isRecordingVoice ? (
          <Square size={15} aria-hidden="true" />
        ) : (
          <Mic size={18} aria-hidden="true" />
        )}
      </IconButton>

      <PopoverRoot open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
        <PopoverTrigger asChild>
          <IconButton
            label={t('composer.insertEmoji')}
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

      <PopoverRoot open={isStickerOpen} onOpenChange={setIsStickerOpen}>
        <PopoverTrigger asChild>
          <IconButton
            label={t('sticker.picker.open')}
            className={styles.attachButton}
            disabled={isComposerDisabled || retryAfterSeconds > 0}
          >
            <Sticker size={18} aria-hidden="true" />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent side="top" align="start">
          {channel ? (
            <StickerPicker
              serverId={channel.serverId}
              onSelect={(stickerId) => {
                setIsStickerOpen(false);
                void composer.sendSticker(stickerId);
              }}
            />
          ) : null}
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

      {channel && !isChannelEncrypted ? (
        <ScheduleSendButton
          destination={{ type: 'channel', id: channel.id }}
          draft={composer.draft}
          files={composer.selectedFiles}
          replyToMessageId={composer.replyingToMessage?.id}
          className={styles.scheduleButton}
          disabled={isComposerDisabled}
          onScheduled={composer.clearAfterSchedule}
        />
      ) : null}

      <IconButton
        type="submit"
        label={t('composer.sendMessage')}
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
