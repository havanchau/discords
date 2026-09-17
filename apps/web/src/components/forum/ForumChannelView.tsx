import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Channel, Message } from '@/api';
import { Button } from '@/components/ui';
import { useForumPosts } from '@/hooks/useForumPosts';
import { useForumTags } from '@/hooks/useForumTags';
import { useTranslation } from '@/i18n/LocaleProvider';
import { ForumPostCard } from './ForumPostCard';
import { NewForumPostDialog } from './NewForumPostDialog';
import styles from './Forum.module.css';

interface ForumChannelViewProps {
  channel: Channel;
  /** Set while the member cannot post (e.g. timed out); the API still decides. */
  disabledReason: string | null;
  onOpenPost: (rootMessage: Message) => void;
}

/** Replaces the message list and composer for a FORUM channel. */
export function ForumChannelView({ channel, disabledReason, onOpenPost }: ForumChannelViewProps) {
  const t = useTranslation();
  const [tagId, setTagId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const { tags } = useForumTags(channel.id);
  const forum = useForumPosts(channel.id, tagId);

  return (
    <div className={styles.forum}>
      <div className={styles.toolbar}>
        <div className={styles.tagFilter} role="group" aria-label={t('forum.filter.label')}>
          <Button
            size="sm"
            variant={tagId === null ? 'secondary' : 'ghost'}
            aria-pressed={tagId === null}
            onClick={() => setTagId(null)}
          >
            {t('forum.filter.all')}
          </Button>
          {tags.map((tag) => (
            <Button
              key={tag.id}
              size="sm"
              variant={tagId === tag.id ? 'secondary' : 'ghost'}
              aria-pressed={tagId === tag.id}
              onClick={() => setTagId(tag.id)}
            >
              {tag.name}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => setIsComposerOpen(true)}
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? undefined}
        >
          <Plus size={16} aria-hidden="true" />
          {t('forum.newPost')}
        </Button>
      </div>

      <div className={styles.list}>
        {forum.isLoading ? (
          <p className="empty-note">
            <Loader2 className="spin" size={16} aria-hidden="true" /> {t('forum.loading')}
          </p>
        ) : forum.error ? (
          <p className="empty-note" role="alert">
            {forum.error instanceof Error
              ? forum.error.message
              : t('error.fallback.cannot-load-forum-posts')}
          </p>
        ) : forum.posts.length === 0 ? (
          <p className="empty-note">{tagId ? t('forum.emptyFiltered') : t('forum.empty')}</p>
        ) : (
          forum.posts.map((post) => (
            <ForumPostCard key={post.thread.id} post={post} onOpen={onOpenPost} />
          ))
        )}
        {forum.hasMore ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={forum.isLoadingMore}
            onClick={() => void forum.loadMore()}
          >
            {forum.isLoadingMore ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
            {t('forum.loadMore')}
          </Button>
        ) : null}
      </div>

      <NewForumPostDialog
        open={isComposerOpen}
        onOpenChange={setIsComposerOpen}
        guidelines={channel.postGuidelines ?? null}
        tags={tags}
        isSubmitting={forum.isCreating}
        onSubmit={forum.createPost}
      />
    </div>
  );
}
