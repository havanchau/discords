import { MessageSquare } from 'lucide-react';
import type { ForumPost, Message } from '@/api';
import { Badge, Button } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import styles from './Forum.module.css';

interface ForumPostCardProps {
  post: ForumPost;
  onOpen: (rootMessage: Message) => void;
}

export function ForumPostCard({ post, onOpen }: ForumPostCardProps) {
  const t = useTranslation();
  const dates = useDateFormat();
  const { thread, rootMessage } = post;
  const title = thread.title ?? '';

  return (
    <Button
      variant="ghost"
      className={styles.card}
      aria-label={t('forum.post.open', { title })}
      onClick={() => onOpen(rootMessage)}
    >
      <strong className={styles.cardTitle}>{title}</strong>
      {thread.tags?.length ? (
        <span className={styles.cardTags}>
          {thread.tags.map((tag) => (
            <Badge key={tag.id} variant="neutral">
              {tag.name}
            </Badge>
          ))}
        </span>
      ) : null}
      <span className={styles.cardExcerpt}>
        {rootMessage.content || t('message.attachmentOnly')}
      </span>
      <span className={styles.cardMeta}>
        <span>{rootMessage.author.displayName}</span>
        <span className={styles.cardReplies}>
          <MessageSquare size={14} aria-hidden="true" />
          {thread.replyCount === 0
            ? t('thread.noReplies')
            : thread.replyCount === 1
              ? t('thread.replyCountOne')
              : t('thread.replyCount', { count: thread.replyCount })}
        </span>
        <span>{t('forum.post.lastActivity', { time: dates.dateTime(thread.lastReplyAt) })}</span>
      </span>
    </Button>
  );
}
