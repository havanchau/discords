import { memo, useState } from 'react';
import { Edit3, Forward, Pin, Reply, SmilePlus, Trash2 } from 'lucide-react';
import type { DirectMessage, Poll } from '@/api';
import { QUICK_REACTIONS } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { extractMarkdownLinks } from '@/utils/markdown';
import { cn } from '@/utils/cn';
import { toViewerReactions } from '@/utils/directMessages';
import {
  Button,
  IconButton,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  TextField,
  Tooltip,
} from '@/components/ui';
import {
  AttachmentPreviewDialog,
  type PreviewAttachment,
} from '@/components/chat/AttachmentPreviewDialog';
import { ForwardedHeader } from '@/components/chat/ForwardedHeader';
import { ForwardMessageDialog } from '@/components/chat/ForwardMessageDialog';
import { LinkPreviewCard } from '@/components/chat/LinkPreviewCard';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { MessageAttachments } from '@/components/chat/MessageAttachments';
import { PollCard } from '@/components/chat/PollCard';
import { SaveMessageAction } from '@/components/saved/SaveMessageAction';
import styles from './DirectMessageRow.module.css';

const MAX_LINK_PREVIEWS = 3;

export interface DirectMessageRowActions {
  onReply: (message: DirectMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onTogglePin: (messageId: string) => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
  onPollUpdate: (poll: Poll) => void;
}

interface DirectMessageRowProps {
  message: DirectMessage;
  viewerId: string;
  accessToken: string;
  authorName: string;
  actions: DirectMessageRowActions;
}

export const DirectMessageRow = memo(function DirectMessageRow({
  message,
  viewerId,
  accessToken,
  authorName,
  actions,
}: DirectMessageRowProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const isMine = message.authorId === viewerId;
  const isDeleted = Boolean(message.deletedAt);
  const reactions = toViewerReactions(message, viewerId);
  const replyTo = message.replyToMessage;

  async function saveEdit() {
    const content = editDraft.trim();
    if (!content) return;
    await actions.onEdit(message.id, content);
    setIsEditing(false);
  }

  return (
    <article
      className={cn(styles.message, isMine && styles.messageMine)}
      data-message-id={message.id}
      data-testid="direct-message"
      tabIndex={-1}
    >
      <header className={styles.meta}>
        <strong>{authorName}</strong>
        <span>{dates.dateTime(message.createdAt)}</span>
        {message.editedAt && !isDeleted ? <span>{t('message.edited')}</span> : null}
        {message.pinnedAt && !isDeleted ? (
          <Pin className={styles.pinnedIcon} size={12} aria-label={t('message.pinnedIcon')} />
        ) : null}
      </header>

      {replyTo ? (
        <button
          type="button"
          className={styles.replyPreview}
          onClick={() => actions.onJumpToMessage(replyTo.id)}
        >
          <Reply size={12} aria-hidden="true" />
          <strong>{replyTo.author?.displayName ?? t('message.fallbackAuthor')}</strong>
          <span>{replyTo.deletedAt ? t('message.deleted') : replyTo.content}</span>
        </button>
      ) : null}

      {!isDeleted && !isEditing && message.forwardOrigin ? (
        <ForwardedHeader origin={message.forwardOrigin} />
      ) : null}

      {isDeleted ? (
        <p className={cn(styles.body, styles.deleted)}>{t('message.deleted')}</p>
      ) : isEditing ? (
        <form
          className={styles.editRow}
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
        >
          <TextField
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsEditing(false);
            }}
            aria-label={t('message.edit.ariaLabel')}
            autoComplete="off"
            maxLength={4000}
            autoFocus
          />
          <Button type="submit" size="sm">
            {t('common.save')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      ) : message.poll ? (
        // DMs have no moderators, so only the poll's creator can close it.
        <PollCard
          poll={message.poll}
          accessToken={accessToken}
          canClose={isMine}
          onPollUpdate={actions.onPollUpdate}
        />
      ) : (
        <>
          {message.content ? (
            <MarkdownContent className={styles.body} content={message.content} />
          ) : null}
          {extractMarkdownLinks(message.content).map((link, index) => (
            <LinkPreviewCard
              key={link}
              url={link}
              canFetchPreview={index < MAX_LINK_PREVIEWS}
              accessToken={accessToken}
            />
          ))}
        </>
      )}

      {!isDeleted ? (
        <MessageAttachments
          attachments={message.attachments ?? []}
          onPreview={setPreviewAttachment}
        />
      ) : null}

      {!isDeleted && reactions.length ? (
        <div className={styles.reactionRow}>
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              className={reaction.me ? styles.reactionActive : undefined}
              aria-pressed={reaction.me}
              aria-label={t('message.reaction.ariaLabel', {
                emoji: reaction.emoji,
                count: reaction.count,
              })}
              onClick={() => void actions.onReact(message.id, reaction.emoji)}
            >
              <span>{reaction.emoji}</span>
              <strong>{reaction.count}</strong>
            </button>
          ))}
        </div>
      ) : null}

      {!isDeleted && !isEditing ? (
        <div className={cn(styles.actions, (isEmojiOpen || isSaveOpen) && styles.actionsVisible)}>
          <Tooltip content={t('message.action.reply')}>
            <IconButton
              label={t('message.action.reply')}
              size="sm"
              onClick={() => actions.onReply(message)}
            >
              <Reply size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <PopoverRoot open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
            <PopoverTrigger asChild>
              <IconButton label={t('message.action.addReaction')} size="sm">
                <SmilePlus size={14} aria-hidden="true" />
              </IconButton>
            </PopoverTrigger>
            <PopoverContent side="top" align="end">
              <div className={styles.emojiGrid}>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={t('message.reaction.reactWith', { emoji })}
                    onClick={() => {
                      setIsEmojiOpen(false);
                      void actions.onReact(message.id, emoji);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </PopoverRoot>
          <Tooltip content={message.pinnedAt ? t('message.action.unpin') : t('message.action.pin')}>
            <IconButton
              label={message.pinnedAt ? t('message.action.unpin') : t('message.action.pin')}
              size="sm"
              aria-pressed={Boolean(message.pinnedAt)}
              onClick={() => void actions.onTogglePin(message.id)}
            >
              <Pin size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <SaveMessageAction
            sourceType="DIRECT"
            messageId={message.id}
            size="sm"
            onOpenChange={setIsSaveOpen}
          />
          <Tooltip content={t('forward.action')}>
            <IconButton
              label={t('forward.action')}
              size="sm"
              onClick={() => setIsForwardOpen(true)}
            >
              <Forward size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          {isMine ? (
            <>
              {/* Poll questions are immutable, so poll messages offer delete but not edit. */}
              {message.poll ? null : (
                <Tooltip content={t('message.action.edit')}>
                  <IconButton
                    label={t('message.action.edit')}
                    size="sm"
                    onClick={() => {
                      setEditDraft(message.content);
                      setIsEditing(true);
                    }}
                  >
                    <Edit3 size={14} aria-hidden="true" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip content={t('message.action.delete')}>
                <IconButton
                  label={t('message.action.delete')}
                  size="sm"
                  variant="danger"
                  onClick={() => void actions.onDelete(message.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </>
          ) : null}
        </div>
      ) : null}
      {isForwardOpen ? (
        <ForwardMessageDialog
          sourceType="DIRECT"
          messageId={message.id}
          onOpenChange={setIsForwardOpen}
        />
      ) : null}
      {previewAttachment ? (
        <AttachmentPreviewDialog
          previewAttachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      ) : null}
    </article>
  );
});
