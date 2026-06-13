import { useState } from 'react';
import {
  Bookmark,
  Edit3,
  FileArchive,
  FileAudio2,
  FileText,
  Link as LinkIcon,
  Lock,
  MessageSquareReply,
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

const MESSAGE_LINK_PATTERN = /(https?:\/\/[^\s]+)/gi;
const MENTION_PATTERN = /(@[\w.-]+)/g;
const MESSAGE_LINK_TEST_PATTERN = /^https?:\/\//i;
const MENTION_TEST_PATTERN = /^@[\w.-]+$/;
const EMOJI_OPTIONS = [
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

interface PreviewAttachment {
  url: string;
  fileName: string;
  kind: 'image' | 'video';
}

function MessageContent({
  message,
  onOpenThread,
}: {
  message: Message;
  onOpenThread: (message: Message) => void;
}) {
  const parts = message.content.split(MESSAGE_LINK_PATTERN);
  const links = parts.filter((part) => MESSAGE_LINK_TEST_PATTERN.test(part));

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
            if (MESSAGE_LINK_TEST_PATTERN.test(part)) {
              return (
                <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
                  {part}
                </a>
              );
            }

            return part.split(MENTION_PATTERN).map((segment, segmentIndex) =>
              MENTION_TEST_PATTERN.test(segment) ? (
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
      {!message.threadId && message.thread?.replyCount ? (
        <button
          type="button"
          className={styles.threadPreview}
          data-testid="thread-preview"
          onClick={() => onOpenThread(message)}
        >
          <MessageSquareReply size={14} aria-hidden="true" />
          <strong>{message.thread.replyCount}</strong>
          <span>{message.thread.replyCount === 1 ? 'reply' : 'replies'}</span>
          {message.thread.lastReplyAt ? (
            <small>Last reply {formatDate(message.thread.lastReplyAt)}</small>
          ) : null}
        </button>
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
  savedMessageIds: string[];
  actions: ChatPanelMessageActions;
  onToggleSaved: (message: Message) => void;
  onPreviewAttachment: (attachment: PreviewAttachment) => void;
}

export function MessageRow({
  message,
  previousMessage,
  auth,
  pinnedMessageIds,
  savedMessageIds,
  actions,
  onToggleSaved,
  onPreviewAttachment,
}: MessageRowProps) {
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [areActionsVisible, setAreActionsVisible] = useState(false);
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
  const isSaved = savedMessageIds.includes(message.id);

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
            onMouseEnter={() => setAreActionsVisible(true)}
            onMouseLeave={() => !isEmojiOpen && setAreActionsVisible(false)}
            onFocusCapture={() => setAreActionsVisible(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget) && !isEmojiOpen) {
                setAreActionsVisible(false);
              }
            }}
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
                <MessageContent message={message} onOpenThread={actions.openThread} />
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

              {!message.deletedAt && !isEditing && areActionsVisible && (
                <div className={`${styles.actions} ${styles.actionsVisible}`}>
                  <Tooltip content="Reply">
                    <IconButton label="Reply" onClick={() => actions.setReplyingToMessage(message)}>
                      <Reply size={14} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Open thread">
                    <IconButton label="Open thread" onClick={() => actions.openThread(message)}>
                      <MessageSquareReply size={14} aria-hidden="true" />
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
                  <Tooltip content={isSaved ? 'Remove saved message' : 'Save message'}>
                    <IconButton
                      label={isSaved ? 'Remove saved message' : 'Save message'}
                      className={isSaved ? styles.selected : ''}
                      onClick={() => onToggleSaved(message)}
                    >
                      <Bookmark size={14} aria-hidden="true" />
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
                          {EMOJI_OPTIONS.map((emoji) => (
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
            <ContextMenuItem onClick={() => actions.openThread(message)}>
              <MessageSquareReply size={14} aria-hidden="true" /> Open Thread
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void actions.togglePinned(message)}>
              <Pin size={14} aria-hidden="true" /> {isPinned ? 'Unpin Message' : 'Pin Message'}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onToggleSaved(message)}>
              <Bookmark size={14} aria-hidden="true" />{' '}
              {isSaved ? 'Remove Saved Message' : 'Save Message'}
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
