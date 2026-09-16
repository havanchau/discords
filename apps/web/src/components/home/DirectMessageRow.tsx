import { memo, useState } from 'react';
import { Edit3, Pin, Reply, SmilePlus, Trash2 } from 'lucide-react';
import type { DirectMessage } from '../../api';
import { QUICK_REACTIONS } from '../../helpers';
import { useTranslation } from '../../i18n/LocaleProvider';
import { useDateFormat } from '../../i18n/useDateFormat';
import { extractMarkdownLinks } from '../../utils/markdown';
import { cn } from '../../utils/cn';
import { toViewerReactions } from '../../utils/directMessages';
import {
  Button,
  IconButton,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  TextField,
  Tooltip,
} from '../ui';
import { LinkPreviewCard } from '../chat/LinkPreviewCard';
import { MarkdownContent } from '../chat/MarkdownContent';
import styles from './DirectMessageRow.module.css';

const MAX_LINK_PREVIEWS = 3;

export interface DirectMessageRowActions {
  onReply: (message: DirectMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onTogglePin: (messageId: string) => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
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
      ) : (
        <>
          <MarkdownContent className={styles.body} content={message.content} />
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
        <div className={cn(styles.actions, isEmojiOpen && styles.actionsVisible)}>
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
          {isMine ? (
            <>
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
    </article>
  );
});
