import { useState } from 'react';
import { Flag, SmilePlus, Trash2 } from 'lucide-react';
import type { Message } from '@/api';
import { SaveMessageAction } from '@/components/saved/SaveMessageAction';
import { useTranslation } from '@/i18n/LocaleProvider';
import { IconButton, PopoverContent, PopoverRoot, PopoverTrigger, Tooltip } from '@/components/ui';
import { EmojiPicker, ReactionEmoji } from './EmojiPicker';
import { ReportMessageDialog } from './ReportMessageDialog';
import { getReactionTooltipText } from '@/helpers';
import styles from './ThreadPanel.module.css';

export interface ThreadMessageActionHandlers {
  viewerId: string;
  /** Server-level approximation for showing "Delete" on others' messages; the API re-checks. */
  canManageMessages: boolean;
  onToggleReaction: (message: Message, emoji: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}

/**
 * Reactions and the react / save / report / delete actions for a thread message, including a forum
 * post, whose root and replies open in the thread panel. Always visible: the panel is narrow and
 * has no hover toolbar.
 */
export function ThreadMessageActions({
  message,
  viewerId,
  canManageMessages,
  onToggleReaction,
  onDeleteMessage,
}: ThreadMessageActionHandlers & { message: Message }) {
  const t = useTranslation();
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (message.deletedAt) return null;
  const isOwn = message.authorId === viewerId;
  const canDelete = isOwn || canManageMessages;

  return (
    <>
      {message.reactions.length ? (
        <div className={styles.reactionRow}>
          {message.reactions.map((reaction) => (
            <Tooltip key={reaction.emoji} content={getReactionTooltipText(reaction, t)}>
              <button
                type="button"
                className={reaction.me ? styles.reactionActive : undefined}
                aria-pressed={reaction.me}
                onClick={() => void onToggleReaction(message, reaction.emoji)}
              >
                <ReactionEmoji emoji={reaction.emoji} />
                <strong>{reaction.count}</strong>
              </button>
            </Tooltip>
          ))}
        </div>
      ) : null}
      <div className={styles.messageActions}>
        <PopoverRoot open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
          <PopoverTrigger asChild>
            <IconButton label={t('message.action.addReaction')} size="sm">
              <SmilePlus size={14} aria-hidden="true" />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent side="top" align="start">
            <EmojiPicker
              onSelect={(emoji) => {
                setIsEmojiOpen(false);
                void onToggleReaction(message, emoji);
              }}
            />
          </PopoverContent>
        </PopoverRoot>
        <SaveMessageAction sourceType="CHANNEL" messageId={message.id} size="sm" />
        {!isOwn ? (
          <Tooltip content={t('report.action')}>
            <IconButton label={t('report.action')} size="sm" onClick={() => setIsReportOpen(true)}>
              <Flag size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ) : null}
        {canDelete ? (
          <Tooltip
            content={
              isConfirmingDelete ? t('thread.action.confirmDelete') : t('message.action.delete')
            }
          >
            <IconButton
              label={
                isConfirmingDelete ? t('thread.action.confirmDelete') : t('message.action.delete')
              }
              size="sm"
              variant="danger"
              onBlur={() => setIsConfirmingDelete(false)}
              onClick={() => {
                // Two clicks: a delete has no undo.
                if (!isConfirmingDelete) {
                  setIsConfirmingDelete(true);
                  return;
                }
                setIsConfirmingDelete(false);
                void onDeleteMessage(message.id);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
      {isReportOpen ? (
        <ReportMessageDialog
          serverId={message.serverId}
          messageId={message.id}
          onOpenChange={setIsReportOpen}
        />
      ) : null}
    </>
  );
}
