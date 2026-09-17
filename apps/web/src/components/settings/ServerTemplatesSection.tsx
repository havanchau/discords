import { useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { SERVER_TEMPLATE_NAME_MAX_LENGTH } from '@discord-clone/shared';
import type { ServerDetail } from '@/api';
import { Banner, Button, IconButton, TextField } from '@/components/ui';
import { useServerTemplates } from '@/hooks/useServerTemplates';
import { useTranslation } from '@/i18n/LocaleProvider';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ServerTemplatesSection.module.css';

interface ServerTemplatesSectionProps {
  server: ServerDetail;
}

/** "Save as template". Rendered only for MANAGE_SERVER holders; the API re-checks. */
export function ServerTemplatesSection({ server }: ServerTemplatesSectionProps) {
  const t = useTranslation();
  const templates = useServerTemplates();
  const [name, setName] = useState(server.name);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const saved = templates.templates.filter((template) => template.sourceServerId === server.id);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setIsSaved(false);
    try {
      await templates.createTemplate({ serverId: server.id, name: name.trim() });
      setIsSaved(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.fallback.cannot-save-template'));
    }
  }

  async function remove(templateId: string) {
    setActionError(null);
    setIsSaved(false);
    try {
      await templates.deleteTemplate(templateId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t('error.fallback.cannot-delete-template'),
      );
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-templates-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-templates-title">{t('template.settings.title')}</strong>
        <span>{t('template.settings.hint')}</span>
      </div>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <TextField
          label={t('template.settings.name')}
          value={name}
          maxLength={SERVER_TEMPLATE_NAME_MAX_LENGTH}
          required
          onChange={(event) => {
            setIsSaved(false);
            setName(event.target.value);
          }}
        />
        <Button type="submit" disabled={templates.isCreating || !name.trim()}>
          {templates.isCreating ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('template.settings.save')}
        </Button>
      </form>
      {templates.isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('template.picker.loading')}
        </p>
      ) : templates.error ? (
        <p className="empty-note" role="alert">
          {templates.error instanceof Error
            ? templates.error.message
            : t('error.fallback.cannot-load-templates')}
        </p>
      ) : saved.length ? (
        <ul className={styles.list}>
          {saved.map((template) => (
            <li className={styles.row} key={template.id}>
              <div>
                <strong>{template.name}</strong>
                <small>
                  {t('template.picker.counts', {
                    roles: template.roleCount,
                    channels: template.channelCount,
                  })}
                </small>
              </div>
              <IconButton
                label={t('template.settings.delete', { name: template.name })}
                variant="danger"
                size="sm"
                disabled={templates.deletingId === template.id}
                onClick={() => void remove(template.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">{t('template.settings.empty')}</p>
      )}
      {actionError ? <Banner variant="danger">{actionError}</Banner> : null}
      {isSaved ? <Banner variant="success">{t('template.settings.saved')}</Banner> : null}
    </section>
  );
}
