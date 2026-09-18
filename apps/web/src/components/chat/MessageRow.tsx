import { memo, useState } from 'react';
import {
  Edit3,
  Flag,
  Forward,
  Lock,
  MessageSquareReply,
  Pin,
  Reply,
  SmilePlus,
  Trash2,
  Unlock,
} from 'lucide-react';
import { assetUrl, AuthState, Message } from '@/api';
import {
  accentClass,
  getReactionTooltipText,
  initials,
  isSameMessageDay,
  previewText,
  QUICK_REACTIONS,
} from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import {
  Badge,
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
} from '@/components/ui';
import { useServerEmojiContext } from '@/contexts/ServerEmojiContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ProfileCard } from '@/components/profile/ProfileCard';
import { SaveMessageAction } from '@/components/saved/SaveMessageAction';
import type { MemberIdentity } from '@/utils/memberIdentity';
import { EmojiPicker, ReactionEmoji } from './EmojiPicker';
import { LinkPreviewCard } from './LinkPreviewCard';
import { extractMarkdownLinks } from '@/utils/markdown';
import { MarkdownContent } from './MarkdownContent';
import type { PreviewAttachment } from './AttachmentPreviewDialog';
import { ForwardedHeader } from './ForwardedHeader';
import { ForwardMessageDialog } from './ForwardMessageDialog';
import { MessageAttachments } from './MessageAttachments';
import { PollCard } from './PollCard';
import { ReportMessageDialog } from './ReportMessageDialog';
import styles from './MessageRow.module.css';
import type { ChatPanelMessageActions } from './types';

const MAX_LINK_PREVIEWS = 3;

function MessageContent({
  message,
  accessToken,
  canClosePoll,
  actions,
  onJumpToMessage,
}: {
  message: Message;
  accessToken: string;
  canClosePoll: boolean;
  actions: Pick<ChatPanelMessageActions, 'openThread' | 'updatePoll'>;
  onJumpToMessage: (messageId: string) => void;
}) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { resolveEmoji } = useServerEmojiContext();
  // A poll message's text is its question, which the card already shows.
  const links = message.poll ? [] : extractMarkdownLinks(message.content);

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
      {message.forwardOrigin ? <ForwardedHeader origin={message.forwardOrigin} /> : null}
      {message.poll ? (
        <PollCard
          poll={message.poll}
          accessToken={accessToken}
          canClose={canClosePoll}
          onPollUpdate={actions.updatePoll}
        />
      ) : message.content ? (
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
                {message.decryptionFailed
                  ? t('message.encrypted.locked')
                  : t('message.encrypted.ok')}
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
          onClick={() => actions.openThread(message)}
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
  /** The unread divider's message always shows its author line, even if it would otherwise be grouped. */
  isFirstUnread?: boolean;
  /** Set while the author may not edit, e.g. during a timeout; the API still refuses on its own. */
  editDisabledReason?: string | null;
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
  isFirstUnread,
  editDisabledReason,
}: MessageRowProps) {
  const t = useTranslation();
  const { isChannelEncrypted } = useWorkspace();
  const dates = useDateFormat();
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [areActionsVisible, setAreActionsVisible] = useState(false);
  const showDateDivider = !isSameMessageDay(previousMessage?.createdAt, message.createdAt);
  const isFirstInGroup =
    !previousMessage ||
    showDateDivider ||
    previousMessage.authorId !== message.authorId ||
    // One webhook can post under a different name each time.
    previousMessage.author.displayName !== message.author.displayName ||
    new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() >
      7 * 60 * 1000 ||
    // The message right after the unread divider always shows its author line.
    isFirstUnread;

  const canManage = message.authorId === auth.user.id && !message.deletedAt;
  // Poll questions are immutable, so a poll message offers delete but not edit.
  const canEdit = canManage && !message.poll;
  const canClosePoll = message.authorId === auth.user.id || actions.canManageMessages;
  const isEditing = actions.editingMessageId === message.id;
  const isPinned = pinnedMessageIds.includes(message.id);
  // An encrypted message is stored as ciphertext, which a forward would copy unreadably; in a channel
  // this client encrypts, a readable older message would leak out of it as plaintext.
  const canForward = !message.isEncrypted && !isChannelEncrypted(message.channelId);
  // Reports go to this server's moderators; the API refuses reporting your own message.
  const canReport = Boolean(serverId) && message.authorId !== auth.user.id;
  const isPopoverOpen = isEmojiOpen || isSaveOpen;
  // A webhook author is not a member and has no profile to open.
  const isWebhookAuthor = message.author.kind === 'WEBHOOK';
  // A bot is a member with a profile, so only the badge sets it apart.
  const isBotAuthor = message.author.kind === 'BOT';
  const authorAvatar = authorIdentity.avatarUrl ? (
    <img src={assetUrl(authorIdentity.avatarUrl)} alt={authorIdentity.displayName} />
  ) : (
    initials(authorIdentity.displayName)
  );

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
            onMouseLeave={() => !isPopoverOpen && setAreActionsVisible(false)}
            onFocusCapture={() => setAreActionsVisible(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget) && !isPopoverOpen) {
                setAreActionsVisible(false);
              }
            }}
          >
            {isFirstInGroup && isWebhookAuthor ? (
              <span
                className={`${styles.avatar} ${styles.messageAvatar} avatar ${accentClass(message.authorId)}`}
              >
                {authorAvatar}
              </span>
            ) : isFirstInGroup ? (
              <PopoverRoot open={isProfileOpen} onOpenChange={setIsProfileOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`${styles.avatar} ${styles.messageAvatar} avatar ${accentClass(message.authorId)}`}
                    aria-label={t('members.viewProfile', { name: authorIdentity.displayName })}
                  >
                    {authorAvatar}
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
                  {isWebhookAuthor ? (
                    <Badge
                      variant="neutral"
                      className={styles.webhookBadge}
                      title={t('message.webhookBadgeLabel')}
                    >
                      {t('message.webhookBadge')}
                    </Badge>
                  ) : isBotAuthor ? (
                    <Badge
                      variant="neutral"
                      className={styles.webhookBadge}
                      title={t('message.botBadgeLabel')}
                    >
                      {t('message.botBadge')}
                    </Badge>
                  ) : null}
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
                  {editDisabledReason ? (
                    <span className={styles.editDisabledReason}>{editDisabledReason}</span>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={Boolean(editDisabledReason)}
                    onClick={() => void actions.saveEdit(message.id)}
                  >
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
                  canClosePoll={canClosePoll}
                  actions={actions}
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
                    <Tooltip key={reaction.emoji} content={getReactionTooltipText(reaction, t)}>
                      <button
                        type="button"
                        className={reaction.me ? styles.active : ''}
                        onClick={() => void actions.toggleReaction(message, reaction.emoji)}
                      >
                        <ReactionEmoji emoji={reaction.emoji} />
                        <strong>{reaction.count}</strong>
                      </button>
                    </Tooltip>
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
                  <SaveMessageAction
                    sourceType="CHANNEL"
                    messageId={message.id}
                    onOpenChange={setIsSaveOpen}
                  />
                  {canForward ? (
                    <Tooltip content={t('forward.action')}>
                      <IconButton
                        label={t('forward.action')}
                        onClick={() => setIsForwardOpen(true)}
                      >
                        <Forward size={14} aria-hidden="true" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
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
                  {canReport ? (
                    <Tooltip content={t('report.action')}>
                      <IconButton label={t('report.action')} onClick={() => setIsReportOpen(true)}>
                        <Flag size={14} aria-hidden="true" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {canManage && (
                    <>
                      {canEdit && (
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
                      )}
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
            {canForward ? (
              <ContextMenuItem onClick={() => setIsForwardOpen(true)}>
                <Forward size={14} aria-hidden="true" /> {t('forward.menu')}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onClick={copyMessageContent}>
              {t('message.menu.copyText')}
            </ContextMenuItem>
            {canReport ? (
              <ContextMenuItem variant="danger" onClick={() => setIsReportOpen(true)}>
                <Flag size={14} aria-hidden="true" /> {t('report.menu')}
              </ContextMenuItem>
            ) : null}
            {canManage && (
              <>
                <ContextMenuSeparator />
                {canEdit && (
                  <ContextMenuItem
                    onClick={() => {
                      actions.setEditingMessageId(message.id);
                      actions.setEditingDraft(message.content);
                    }}
                  >
                    <Edit3 size={14} aria-hidden="true" /> {t('message.menu.edit')}
                  </ContextMenuItem>
                )}
                <ContextMenuItem variant="danger" onClick={() => void actions.delete(message.id)}>
                  <Trash2 size={14} aria-hidden="true" /> {t('message.menu.delete')}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenuRoot>
      {isForwardOpen ? (
        <ForwardMessageDialog
          sourceType="CHANNEL"
          messageId={message.id}
          onOpenChange={setIsForwardOpen}
        />
      ) : null}
      {isReportOpen && serverId ? (
        <ReportMessageDialog
          serverId={serverId}
          messageId={message.id}
          onOpenChange={setIsReportOpen}
        />
      ) : null}
    </div>
  );
});
