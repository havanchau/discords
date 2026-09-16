import { memo, useState } from 'react';
import {
  Edit3,
  FileArchive,
  FileAudio2,
  FileText,
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
  initials,
  isSameMessageDay,
  previewText,
  QUICK_REACTIONS,
} from '../../helpers';
import { useTranslation } from '../../i18n/LocaleProvider';
import { useDateFormat } from '../../i18n/useDateFormat';
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
import { useServerEmojiContext } from '../../contexts/ServerEmojiContext';
import { ProfileCard } from '../profile/ProfileCard';
import type { MemberIdentity } from '../../utils/memberIdentity';
import { EmojiPicker, ReactionEmoji } from './EmojiPicker';
import { LinkPreviewCard } from './LinkPreviewCard';
import { extractMarkdownLinks } from '../../utils/markdown';
import { MarkdownContent } from './MarkdownContent';
import styles from './MessageRow.module.css';
import type { ChatPanelMessageActions } from './types';

const MAX_LINK_PREVIEWS = 3;

interface PreviewAttachment {
  url: string;
  fileName: string;
  kind: 'image' | 'video';
}

function MessageContent({
  message,
  accessToken,
  onOpenThread,
  onJumpToMessage,
}: {
  message: Message;
  accessToken: string;
  onOpenThread: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
}) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { resolveEmoji } = useServerEmojiContext();
  const links = extractMarkdownLinks(message.content);

  return (
    <>
      {message.replyToMessage ? (
        <button
          type="button"
          className={styles.replyPreview}
          data-testid="reply-preview"
          onClick={() => {
            if (message.replyToMessage) onJumpToMessage(message.replyToMessage.id);
          }}
        >
          <Reply size={13} aria-hidden="true" />
          <strong>{message.replyToMessage.author.displayName}</strong>
          <span>{previewText(message.replyToMessage)}</span>
        </button>
      ) : null}
      {message.content ? (
        <MarkdownContent
          className={styles.content}
          content={message.content}
          resolveEmoji={resolveEmoji}
          prefix={
            message.isEncrypted ? (
              <span
                className={`${styles.encryptedPill} ${message.decryptionFailed ? styles.locked : ''}`}
              >
                {message.decryptionFailed ? (
                  <Lock size={12} aria-hidden="true" />
                ) : (
                  <Unlock size={12} aria-hidden="true" />
                )}
                {message.decryptionFailed ? t('message.encrypted.locked') : t('message.encrypted.ok')}
              </span>
            ) : null
          }
        />
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
          <span>
            {message.thread.replyCount === 1
              ? t('message.thread.replySingular')
              : t('message.thread.replyPlural')}
          </span>
          {message.thread.lastReplyAt ? (
            <small>
              {t('message.thread.lastReply', { date: dates.dateTime(message.thread.lastReplyAt) })}
            </small>
          ) : null}
        </button>
      ) : null}
      {links.map((link, index) => (
        <LinkPreviewCard
          key={link}
          url={link}
          canFetchPreview={index < MAX_LINK_PREVIEWS && !message.isEncrypted}
          accessToken={accessToken}
        />
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
  const t = useTranslation();

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
                  {t('attachment.openPreview')}
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
  serverId: string | null;
  authorIdentity: MemberIdentity;
  pinnedMessageIds: string[];
  actions: ChatPanelMessageActions;
  onPreviewAttachment: (attachment: PreviewAttachment) => void;
  onJumpToMessage: (messageId: string) => void;
}

// Memoized: the list re-renders on typing and other workspace events that do not touch a row.
export const MessageRow = memo(function MessageRow({
  message,
  previousMessage,
  auth,
  serverId,
  authorIdentity,
  pinnedMessageIds,
  actions,
  onPreviewAttachment,
  onJumpToMessage,
}: MessageRowProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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

  function copyMessageContent() {
    void navigator.clipboard?.writeText(message.content);
  }

  return (
    <div className={styles.messageBlock}>
      {showDateDivider && (
        <div className={styles.dateDivider}>
          <span>{dates.dayDivider(message.createdAt)}</span>
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
              <PopoverRoot open={isProfileOpen} onOpenChange={setIsProfileOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`${styles.avatar} ${styles.messageAvatar} avatar ${accentClass(message.authorId)}`}
                    aria-label={t('members.viewProfile', { name: authorIdentity.displayName })}
                  >
                    {authorIdentity.avatarUrl ? (
                      <img
                        src={assetUrl(authorIdentity.avatarUrl)}
                        alt={authorIdentity.displayName}
                      />
                    ) : (
                      initials(authorIdentity.displayName)
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start">
                  <ProfileCard
                    accessToken={auth.accessToken}
                    userId={message.authorId}
                    viewerId={auth.user.id}
                    serverId={serverId}
                    isOpen={isProfileOpen}
                    onDirectMessage={actions.startDirectConversation}
                    onAddFriend={actions.sendFriendRequest}
                  />
                </PopoverContent>
              </PopoverRoot>
            ) : (
              <span className={styles.hoverTimestamp}>{dates.time(message.createdAt)}</span>
            )}

            <div className={styles.body}>
              {isFirstInGroup && (
                <div className={styles.meta}>
                  <strong>{authorIdentity.displayName}</strong>
                  <span>{dates.dateTime(message.createdAt)}</span>
                  {message.editedAt ? <span>{t('message.edited')}</span> : null}
                </div>
              )}

              {message.deletedAt ? (
                <p className={styles.deletedMessage}>{t('message.deleted')}</p>
              ) : isEditing ? (
                <div className={styles.editRow}>
                  <TextField
                    value={actions.editingDraft}
                    onChange={(event) => actions.setEditingDraft(event.target.value)}
                    autoFocus
                    className={styles.editInput}
                    aria-label={t('message.edit.ariaLabel')}
                    autoComplete="off"
                  />
                  <Button size="sm" onClick={() => void actions.saveEdit(message.id)}>
                    {t('common.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      actions.setEditingMessageId(null);
                      actions.setEditingDraft('');
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <MessageContent
                  message={message}
                  accessToken={auth.accessToken}
                  onOpenThread={actions.openThread}
                  onJumpToMessage={onJumpToMessage}
                />
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
                      title={t('message.reaction.title', { emoji: reaction.emoji })}
                    >
                      <ReactionEmoji emoji={reaction.emoji} />
                      <strong>{reaction.count}</strong>
                    </button>
                  ))}
                </div>
              )}

              {!message.deletedAt && !isEditing && areActionsVisible && (
                <div className={`${styles.actions} ${styles.actionsVisible}`}>
                  <Tooltip content={t('message.action.reply')}>
                    <IconButton
                      label={t('message.action.reply')}
                      onClick={() => actions.setReplyingToMessage(message)}
                    >
                      <Reply size={14} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content={t('message.action.openThread')}>
                    <IconButton
                      label={t('message.action.openThread')}
                      onClick={() => actions.openThread(message)}
                    >
                      <MessageSquareReply size={14} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content={isPinned ? t('message.action.unpin') : t('message.action.pin')}>
                    <IconButton
                      label={isPinned ? t('message.action.unpin') : t('message.action.pin')}
                      className={isPinned ? styles.selected : ''}
                      onClick={() => void actions.togglePinned(message)}
                    >
                      <Pin size={14} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                  <div className={styles.quickReactions} title={t('message.action.quickReactions')}>
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
                        <IconButton label={t('message.action.addReaction')}>
                          <SmilePlus size={14} aria-hidden="true" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="end">
                        <EmojiPicker
                          onSelect={(emoji) => {
                            setIsEmojiOpen(false);
                            void actions.toggleReaction(message, emoji);
                          }}
                        />
                      </PopoverContent>
                    </PopoverRoot>
                  </div>
                  {canManage && (
                    <>
                      <Tooltip content={t('message.action.edit')}>
                        <IconButton
                          label={t('message.action.edit')}
                          onClick={() => {
                            actions.setEditingMessageId(message.id);
                            actions.setEditingDraft(message.content);
                          }}
                        >
                          <Edit3 size={14} aria-hidden="true" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content={t('message.action.delete')}>
                        <IconButton
                          label={t('message.action.delete')}
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
              <Reply size={14} aria-hidden="true" /> {t('message.menu.reply')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => actions.openThread(message)}>
              <MessageSquareReply size={14} aria-hidden="true" /> {t('message.menu.openThread')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void actions.togglePinned(message)}>
              <Pin size={14} aria-hidden="true" />{' '}
              {isPinned ? t('message.menu.unpin') : t('message.menu.pin')}
            </ContextMenuItem>
            <ContextMenuItem onClick={copyMessageContent}>{t('message.menu.copyText')}</ContextMenuItem>
            {canManage && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => {
                    actions.setEditingMessageId(message.id);
                    actions.setEditingDraft(message.content);
                  }}
                >
                  <Edit3 size={14} aria-hidden="true" /> {t('message.menu.edit')}
                </ContextMenuItem>
                <ContextMenuItem variant="danger" onClick={() => void actions.delete(message.id)}>
                  <Trash2 size={14} aria-hidden="true" /> {t('message.menu.delete')}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenuRoot>
    </div>
  );
});
