import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { FORUM_MAX_TAGS, FORUM_TAG_NAME_MAX_LENGTH } from '@discord-clone/shared';
import { Button, IconButton, TextField } from '@/components/ui';
import { useForumTags } from '@/hooks/useForumTags';
import { useTranslation } from '@/i18n/LocaleProvider';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ForumTagsSection.module.css';

interface DraftTag {
  /** Stored tag id; absent for a tag added in this edit. */
  id?: string;
  key: string;
  name: string;
}

/**
 * The tag set of a FORUM channel. It sits inside the channel settings form but saves on its own
 * (`PUT /channels/:channelId/forum-tags`), so its buttons never submit that form.
 */
export function ForumTagsSection({ channelId }: { channelId: string }) {
  const t = useTranslation();
  const forumTags = useForumTags(channelId);
  // Null until the user edits; until then the list mirrors the stored tags.
  const [edited, setEdited] = useState<DraftTag[] | null>(null);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const drafts =
    edited ?? forumTags.tags.map((tag) => ({ id: tag.id, key: tag.id, name: tag.name }));

  function update(next: DraftTag[]) {
    setEdited(next);
    setStatus(null);
  }

  async function save() {
    setStatus(null);
    try {
      await forumTags.replaceTags({
        tags: drafts.map((draft) => ({ id: draft.id, name: draft.name.trim() })),
      });
      setEdited(null);
      setStatus({ error: false, text: t('forum.settings.tagsSaved') });
    } catch (err) {
      setStatus({
        error: true,
        text: err instanceof Error ? err.message : t('error.fallback.cannot-save-forum-tags'),
      });
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="forum-tags-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="forum-tags-title">{t('forum.settings.tagsTitle')}</strong>
        <span>{t('forum.settings.tagsHint', { max: FORUM_MAX_TAGS })}</span>
      </div>
      {forumTags.isLoading ? (
        <p className="empty-note">
          <Loader2 className="spin" size={16} aria-hidden="true" />
        </p>
      ) : drafts.length === 0 ? (
        <p className="empty-note">{t('forum.settings.tagsEmpty')}</p>
      ) : (
        drafts.map((draft, index) => (
          <div key={draft.key} className={styles.row}>
            <TextField
              fieldClassName={styles.name}
              label={t('forum.settings.tagName')}
              value={draft.name}
              maxLength={FORUM_TAG_NAME_MAX_LENGTH}
              // Enter would submit the surrounding channel settings form.
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              onChange={(event) =>
                update(
                  drafts.map((item, i) =>
                    i === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
            <IconButton
              label={t('forum.settings.removeTag', { name: draft.name })}
              onClick={() => update(drafts.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} aria-hidden="true" />
            </IconButton>
          </div>
        ))
      )}
      {status ? (
        <p className="empty-note" role={status.error ? 'alert' : 'status'}>
          {status.text}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          disabled={drafts.length >= FORUM_MAX_TAGS}
          onClick={() => update([...drafts, { key: crypto.randomUUID(), name: '' }])}
        >
          <Plus size={16} aria-hidden="true" />
          {t('forum.settings.addTag')}
        </Button>
        <Button
          size="sm"
          disabled={
            edited === null || forumTags.isSaving || drafts.some((draft) => !draft.name.trim())
          }
          onClick={() => void save()}
        >
          {forumTags.isSaving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('forum.settings.saveTags')}
        </Button>
      </div>
    </section>
  );
}
