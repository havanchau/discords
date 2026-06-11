import { FormEvent } from 'react';
import { Loader2, MessageSquareReply, Send, X } from 'lucide-react';
import { assetUrl, Message } from '../../api';
import { formatDate, initials, previewText } from '../../helpers';
import { Button, IconButton } from '../ui';
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
  if (!rootMessage) return null;

  return (
    <aside className={styles.panel} aria-label={`Thread for ${previewText(rootMessage)}`}>
      <header className={styles.header}>
        <span>
          <MessageSquareReply size={18} aria-hidden="true" />
          Thread
        </span>
        <IconButton label="Close thread" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </header>

      <div className={styles.timeline}>
        <ThreadMessage message={rootMessage} isRoot />
        <div className={styles.replyDivider}>
          {rootMessage.thread?.replyCount
            ? `${rootMessage.thread.replyCount} ${rootMessage.thread.replyCount === 1 ? 'reply' : 'replies'}`
            : 'No replies yet'}
        </div>
        {isLoading ? (
          <div className={styles.loading}>
            <Loader2 className="spin" size={18} aria-hidden="true" /> Loading thread…
          </div>
        ) : (
          messages.map((message) => <ThreadMessage key={message.id} message={message} />)
        )}
      </div>

      <form className={styles.composer} onSubmit={(event) => void onSend(event)}>
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Reply in thread"
          aria-label="Reply in thread"
          disabled={isSending}
        />
        <Button type="submit" size="sm" disabled={!draft.trim() || isSending}>
          {isSending ? (
            <Loader2 className="spin" size={16} aria-hidden="true" />
          ) : (
            <Send size={16} />
          )}
          Send
        </Button>
      </form>
    </aside>
  );
}

function ThreadMessage({ message, isRoot = false }: { message: Message; isRoot?: boolean }) {
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
          <span>{formatDate(message.createdAt)}</span>
        </div>
        <p className={message.deletedAt ? styles.deleted : undefined}>
          {message.deletedAt ? 'Message deleted' : message.content || 'Attachment'}
        </p>
      </div>
    </article>
  );
}
