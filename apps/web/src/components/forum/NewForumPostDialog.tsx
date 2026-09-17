import { FormEvent, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { FORUM_POST_MAX_TAGS, FORUM_POST_TITLE_MAX_LENGTH } from '@discord-clone/shared';
import type { ForumTagView } from '@/api';
import {
  Button,
  Checkbox,
  DialogContent,
  DialogRoot,
  IconButton,
  TextArea,
  TextField,
} from '@/components/ui';
import type { NewForumPost } from '@/hooks/useForumPosts';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './Forum.module.css';

interface NewForumPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guidelines: string | null;
  tags: ForumTagView[];
  isSubmitting: boolean;
  onSubmit: (post: NewForumPost) => Promise<unknown>;
}

export function NewForumPostDialog({
  open,
  onOpenChange,
  guidelines,
  tags,
  isSubmitting,
  onSubmit,
}: NewForumPostDialogProps) {
  const t = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = Boolean(title.trim()) && Boolean(content.trim() || files.length);

  function reset() {
    setTitle('');
    setContent('');
    setTagIds([]);
    setFiles([]);
    setError(null);
  }

  function toggleTag(tagId: string, checked: boolean) {
    setTagIds((current) =>
      checked ? [...current, tagId] : current.filter((item) => item !== tagId),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setError(null);
    try {
      await onSubmit({ title: title.trim(), tagIds, content: content.trim(), files });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-create-forum-post'));
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('forum.form.title')} description={guidelines ?? undefined}>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <TextField
            label={t('forum.form.postTitle')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={FORUM_POST_TITLE_MAX_LENGTH}
            required
            autoFocus
          />
          {tags.length ? (
            <fieldset className={styles.tagPicker}>
              <legend>{t('forum.form.tags', { max: FORUM_POST_MAX_TAGS })}</legend>
              {tags.map((tag) => {
                const checked = tagIds.includes(tag.id);
                return (
                  <label key={tag.id} className={styles.tagOption}>
                    <Checkbox
                      checked={checked}
                      disabled={!checked && tagIds.length >= FORUM_POST_MAX_TAGS}
                      onCheckedChange={(next) => toggleTag(tag.id, next === true)}
                    />
                    {tag.name}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <TextArea
            label={t('forum.form.content')}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={4000}
            rows={6}
          />
          <div className={styles.files}>
            <input
              ref={fileInputRef}
              className={styles.hiddenInput}
              type="file"
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                setFiles((current) => [...current, ...selected]);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={16} aria-hidden="true" />
              {t('forum.form.attach')}
            </Button>
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className={styles.file}>
                {file.name}
                <IconButton
                  label={t('forum.form.removeFile', { name: file.name })}
                  size="sm"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  <X size={14} aria-hidden="true" />
                </IconButton>
              </span>
            ))}
          </div>
          {error ? (
            <p className="empty-note" role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.formFooter}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
              {t('forum.form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
