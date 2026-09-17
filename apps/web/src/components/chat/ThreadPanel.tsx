import { FormEvent } from 'react';
import { Loader2, MessageSquareReply, Send, X } from 'lucide-react';
import { assetUrl, Message } from '@/api';
import { initials, previewText } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { Button, IconButton } from '@/components/ui';
import { useServerEmojiContext } from '@/contexts/ServerEmojiContext';
import { MarkdownContent } from './MarkdownContent';
import styles from './ThreadPanel.module.css';

interface ThreadPanelProps {
  rootMessage: Message | null;
  messages: Message[];
  draft: string;
  isLoading: boolean;
  isSending: boolean;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function ThreadPanel({
  rootMessage,
  messages,
  draft,
  isLoading,
  isSending,
  onClose,
  onDraftChange,
  onSend,
}: ThreadPanelProps) {
  const t = useTranslation();

  if (!rootMessage) return null;

  return (
    <aside
      className={styles.panel}
      aria-label={t('thread.ariaLabel', { preview: previewText(rootMessage) })}
    >
      <header className={styles.header}>
        <span>
          <MessageSquareReply size={18} aria-hidden="true" />
          {rootMessage.thread?.title ?? t('thread.title')}
        </span>
        <IconButton label={t('thread.close')} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </header>

      <div className={styles.timeline}>
        <ThreadMessage message={rootMessage} isRoot />
        <div className={styles.replyDivider}>
          {rootMessage.thread?.replyCount
            ? rootMessage.thread.replyCount === 1
              ? t('thread.replyCountOne')
              : t('thread.replyCount', { count: rootMessage.thread.replyCount })
            : t('thread.noReplies')}
        </div>
        {isLoading ? (
          <div className={styles.loading}>
            <Loader2 className="spin" size={18} aria-hidden="true" /> {t('thread.loading')}
          </div>
        ) : (
          messages.map((message) => <ThreadMessage key={message.id} message={message} />)
        )}
      </div>

      <form className={styles.composer} onSubmit={(event) => void onSend(event)}>
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={t('thread.composerPlaceholder')}
          aria-label={t('thread.composerPlaceholder')}
          disabled={isSending}
        />
        <Button type="submit" size="sm" disabled={!draft.trim() || isSending}>
          {isSending ? (
            <Loader2 className="spin" size={16} aria-hidden="true" />
          ) : (
            <Send size={16} />
          )}
          {t('common.send')}
        </Button>
      </form>
    </aside>
  );
}

function ThreadMessage({ message, isRoot = false }: { message: Message; isRoot?: boolean }) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { resolveEmoji } = useServerEmojiContext();
  return (
    <article className={`${styles.message} ${isRoot ? styles.rootMessage : ''}`}>
      <div className={`${styles.avatar} avatar`}>
        {message.author.avatarUrl ? (
          <img src={assetUrl(message.author.avatarUrl)} alt={message.author.displayName} />
        ) : (
          initials(message.author.displayName)
        )}
      </div>
      <div className={styles.messageBody}>
        <div className={styles.meta}>
          <strong>{message.author.displayName}</strong>
          <span>{dates.dateTime(message.createdAt)}</span>
        </div>
        {message.deletedAt || !message.content ? (
          <p className={message.deletedAt ? styles.deleted : undefined}>
            {message.deletedAt ? t('message.deleted') : t('message.attachmentOnly')}
          </p>
        ) : (
          <MarkdownContent
            className={styles.messageText}
            content={message.content}
            resolveEmoji={resolveEmoji}
          />
        )}
      </div>
    </article>
  );
}
