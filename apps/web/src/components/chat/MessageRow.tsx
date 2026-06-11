import { useState } from 'react';
import {
  Edit3,
  FileArchive,
  FileAudio2,
  FileText,
  Link as LinkIcon,
  Lock,
  Pin,
  Reply,
  SmilePlus,
  Trash2,
  Unlock,
} from 'lucide-react';
import { assetUrl, AuthState, Message, MessageAttachment } from '../../api';
import {
  accentClass,
  attachmentKind,
  extractLinks,
  formatBytes,
  formatDate,
  formatDayDivider,
  formatTime,
  initials,
  isSameMessageDay,
  previewText,
  QUICK_REACTIONS,
} from '../../helpers';
import {
  Button,
  IconButton,
  Tooltip,
  TextField,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '../ui';
import styles from './MessageRow.module.css';
import type { ChatPanelMessageActions } from './types';

interface PreviewAttachment {
  url: string;
  fileName: string;
  kind: 'image' | 'video';
}

function MessageContent({ message }: { message: Message }) {
  const links = extractLinks(message.content);
  const parts = message.content.split(/(https?:\/\/[^\s]+)/gi);

  return (
    <>
      {message.replyToMessage ? (
        <button
          type="button"
          className={styles.replyPreview}
          data-testid="reply-preview"
          onClick={() => {
            document
              .querySelector(`[data-message-id="${message.replyToMessage?.id}"]`)
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <Reply size={13} aria-hidden="true" />
          <strong>{message.replyToMessage.author.displayName}</strong>
          <span>{previewText(message.replyToMessage)}</span>
        </button>
      ) : null}
      {message.content ? (
        <p className={styles.content}>
          {message.isEncrypted ? (
            <span
              className={`${styles.encryptedPill} ${message.decryptionFailed ? styles.locked : ''}`}
            >
              {message.decryptionFailed ? (
                <Lock size={12} aria-hidden="true" />
              ) : (
                <Unlock size={12} aria-hidden="true" />
              )}
              {message.decryptionFailed ? 'Locked' : 'E2EE'}
            </span>
          ) : null}
          {parts.map((part, index) => {
            if (/^https?:\/\//i.test(part)) {
              return (
                <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
                  {part}
                </a>
              );
            }

            return part.split(/(@[\w.-]+)/g).map((segment, segmentIndex) =>
              /^@[\w.-]+$/.test(segment) ? (
                <span className={styles.mention} key={`${part}-${index}-${segmentIndex}`}>
                  {segment}
                </span>
              ) : (
                <span key={`${part}-${index}-${segmentIndex}`}>{segment}</span>
              ),
            );
          })}
        </p>
      ) : null}
      {links.map((link) => (
        <a
          key={link}
          className={styles.linkPreview}
          href={link}
          target="_blank"
          rel="noreferrer"
          data-testid="link-preview"
        >
          <LinkIcon size={18} aria-hidden="true" />
          <span>{link.replace(/^https?:\/\//i, '')}</span>
        </a>
      ))}
    </>
  );
}

function MessageAttachments({
  attachments,
  onPreview,
}: {
  attachments: MessageAttachment[];
  onPreview: (attachment: PreviewAttachment) => void;
}) {
  if (!attachments.length) return null;

  return (
    <div className={styles.attachmentGrid}>
      {attachments.map((attachment) => {
        const kind = attachmentKind(attachment);
        const url = assetUrl(attachment.url);

        if (kind === 'image') {
          return (
            <button
              type="button"
              key={attachment.id ?? attachment.url}
              className={`${styles.attachment} ${styles.imageAttachment}`}
              onClick={() => onPreview({ url, fileName: attachment.fileName, kind: 'image' })}
            >
              <img src={url} alt={attachment.fileName} />
            </button>
          );
        }

        if (kind === 'video') {
          return (
            <div
              key={attachment.id ?? attachment.url}
              className={`${styles.attachment} ${styles.videoAttachment}`}
            >
              <video src={url} controls preload="metadata" />
              <span>
                {attachment.fileName}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPreview({ url, fileName: attachment.fileName, kind: 'video' })}
                >
                  Open preview
                </Button>
              </span>
            </div>
          );
        }

        if (kind === 'audio') {
          return (
            <div
              key={attachment.id ?? attachment.url}
              className={`${styles.attachment} ${styles.audioAttachment}`}
            >
              <div className={styles.audioAttachmentHeader}>
                <FileAudio2 size={18} aria-hidden="true" />
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>{formatBytes(attachment.byteSize)}</small>
                </span>
              </div>
              <div className={styles.audioWaveform} aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <audio src={url} controls preload="metadata" />
            </div>
          );
        }

        const Icon = kind === 'archive' ? FileArchive : FileText;
        return (
          <a
            key={attachment.id ?? attachment.url}
            className={styles.fileAttachment}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>{attachment.fileName}</strong>
              <small>{formatBytes(attachment.byteSize)}</small>
            </span>
          </a>
        );
      })}
    </div>
  );
}

interface MessageRowProps {
  message: Message;
  previousMessage?: Message;
  auth: AuthState;
  pinnedMessageIds: string[];
  actions: ChatPanelMessageActions;
  onPreviewAttachment: (attachment: PreviewAttachment) => void;
}

export function MessageRow({
  message,
  previousMessage,
  auth,
  pinnedMessageIds,
  actions,
  onPreviewAttachment,
}: MessageRowProps) {
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const emojiOptions = [
    '👍',
    '🔥',
    '😂',
    '❤️',
    '🎉',
    '👏',
    '🙏',
    '😍',
    '😮',
    '😢',
    '😡',
    '✅',
    '👀',
    '💯',
    '🚀',
    '✨',
  ];

  const showDateDivider = !isSameMessageDay(previousMessage?.createdAt, message.createdAt);
  const isFirstInGroup =
    !previousMessage ||
    showDateDivider ||
    previousMessage.authorId !== message.authorId ||
    new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() >
      7 * 60 * 1000;

  const canManage = message.authorId === auth.user.id && !message.deletedAt;
  const isEditing = actions.editingMessageId === message.id;
  const isPinned = pinnedMessageIds.includes(message.id);

  function copyMessageContent() {
    void navigator.clipboard?.writeText(message.content);
  }

  return (
    <div className={styles.messageBlock}>
      {showDateDivider && (
        <div className={styles.dateDivider}>
          <span>{formatDayDivider(message.createdAt)}</span>
        </div>
      )}

      <ContextMenuRoot>
        <ContextMenuTrigger>
          <article
            className={`${styles.message} ${isFirstInGroup ? styles.firstInGroup : styles.groupedMessage}`}
            data-testid="message"
            data-message-id={message.id}
            tabIndex={-1}
          >
            {isFirstInGroup ? (
              <div
                className={`${styles.avatar} ${styles.messageAvatar} avatar ${accentClass(message.authorId)}`}
              >
                {message.author.avatarUrl ? (
                  <img src={assetUrl(message.author.avatarUrl)} alt={message.author.displayName} />
                ) : (
                  initials(message.author.displayName)
                )}
              </div>
            ) : (
              <span className={styles.hoverTimestamp}>{formatTime(message.createdAt)}</span>
            )}

            <div className={styles.body}>
              {isFirstInGroup && (
                <div className={styles.meta}>
                  <strong>{message.author.displayName}</strong>
                  <span>{formatDate(message.createdAt)}</span>
                  {message.editedAt ? <span>edited</span> : null}
                </div>
              )}

              {message.deletedAt ? (
                <p className={styles.deletedMessage}>Message deleted</p>
              ) : isEditing ? (
                <div className={styles.editRow}>
                  <TextField
                    value={actions.editingDraft}
                    onChange={(event) => actions.setEditingDraft(event.target.value)}
                    autoFocus
                    className={styles.editInput}
                    aria-label="Edit message"
                    autoComplete="off"
                  />
                  <Button size="sm" onClick={() => void actions.saveEdit(message.id)}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      actions.setEditingMessageId(null);
                      actions.setEditingDraft('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <MessageContent message={message} />
              )}

              {!message.deletedAt && (
                <MessageAttachments
                  attachments={message.attachments ?? []}
                  onPreview={onPreviewAttachment}
                />
              )}

              {!message.deletedAt && (
                <div className={styles.reactionRow} data-testid="reaction-row">
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      type="button"
                      className={reaction.me ? styles.active : ''}
                      onClick={() => void actions.toggleReaction(message, reaction.emoji)}
                      title={`React ${reaction.emoji}`}
                    >
                      <span>{reaction.emoji}</span>
                      <strong>{reaction.count}</strong>
                    </button>
                  ))}
                </div>
              )}

              {!message.deletedAt && !isEditing && (
                <div className={styles.actions}>
                  <Tooltip content="Reply">
                    <IconButton label="Reply" onClick={() => actions.setReplyingToMessage(message)}>
                      <Reply size={14} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content={isPinned ? 'Unpin message' : 'Pin message'}>
                    <IconButton
                      label={isPinned ? 'Unpin message' : 'Pin message'}
                      className={isPinned ? styles.selected : ''}
                      onClick={() => void actions.togglePinned(message)}
                    >
                      <Pin size={14} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <div className={styles.quickReactions} title="Quick reactions">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        data-testid="quick-reaction"
                        onClick={() => void actions.toggleReaction(message, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    <PopoverRoot open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                      <PopoverTrigger asChild>
                        <IconButton label="Add reaction">
                          <SmilePlus size={14} aria-hidden="true" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="end">
                        <div className={styles.emojiPickerPopover}>
                          {emojiOptions.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setIsEmojiOpen(false);
                                void actions.toggleReaction(message, emoji);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </PopoverRoot>
                  </div>
                  {canManage && (
                    <>
                      <Tooltip content="Edit message">
                        <IconButton
                          label="Edit message"
                          onClick={() => {
                            actions.setEditingMessageId(message.id);
                            actions.setEditingDraft(message.content);
                          }}
                        >
                          <Edit3 size={14} aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content="Delete message">
                        <IconButton
                          label="Delete message"
                          variant="danger"
                          onClick={() => void actions.delete(message.id)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </div>
              )}
            </div>
          </article>
        </ContextMenuTrigger>

        {!message.deletedAt && (
          <ContextMenuContent>
            <ContextMenuItem onClick={() => actions.setReplyingToMessage(message)}>
              <Reply size={14} aria-hidden="true" /> Reply
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void actions.togglePinned(message)}>
              <Pin size={14} aria-hidden="true" /> {isPinned ? 'Unpin Message' : 'Pin Message'}
            </ContextMenuItem>
            <ContextMenuItem onClick={copyMessageContent}>Copy Text</ContextMenuItem>
            {canManage && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => {
                    actions.setEditingMessageId(message.id);
                    actions.setEditingDraft(message.content);
                  }}
                >
                  <Edit3 size={14} aria-hidden="true" /> Edit Message
                </ContextMenuItem>
                <ContextMenuItem variant="danger" onClick={() => void actions.delete(message.id)}>
                  <Trash2 size={14} aria-hidden="true" /> Delete Message
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenuRoot>
    </div>
  );
}
