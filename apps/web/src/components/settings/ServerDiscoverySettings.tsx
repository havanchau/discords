import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import {
  DISCOVERY_MAX_TAGS,
  DISCOVERY_MIN_MEMBERS,
  DISCOVERY_TAG_MAX_LENGTH,
} from '@discord-clone/shared';
import type { ServerDetail, ServerDiscoverySettings as DiscoverySettings } from '@/api';
import { Banner, Button, TextField } from '@/components/ui';
import { useServerDiscoverySettings } from '@/hooks/useServerDiscovery';
import { useTranslation } from '@/i18n/LocaleProvider';
import { SwitchRow } from './SettingsRows';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ServerDiscoverySettings.module.css';

interface ServerDiscoverySettingsProps {
  server: ServerDetail;
}

/**
 * Discovery listing. The card's description is the server description edited above, so this section
 * has no description field of its own. Rendered only for MANAGE_SERVER holders; the API re-checks.
 */
export function ServerDiscoverySettings({ server }: ServerDiscoverySettingsProps) {
  const t = useTranslation();
  const discovery = useServerDiscoverySettings(server.id);

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-discovery-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-discovery-title">{t('discovery.settings.title')}</strong>
        <span>{t('discovery.settings.hint')}</span>
      </div>
      {discovery.isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
          {t('discovery.settings.loading')}
        </p>
      ) : discovery.error || !discovery.settings ? (
        <p className="empty-note" role="alert">
          {discovery.error instanceof Error
            ? discovery.error.message
            : t('error.fallback.cannot-load-discovery')}
        </p>
      ) : (
        <DiscoveryForm settings={discovery.settings} discovery={discovery} />
      )}
    </section>
  );
}

interface DiscoveryFormProps {
  settings: DiscoverySettings;
  discovery: ReturnType<typeof useServerDiscoverySettings>;
}

function DiscoveryForm({ settings, discovery }: DiscoveryFormProps) {
  const t = useTranslation();
  const [listed, setListed] = useState(settings.listed);
  const [tagsText, setTagsText] = useState(settings.tags.join(', '));
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  // An already-listed server that dropped below the floor can still be unlisted.
  const canList = settings.eligible || settings.listed;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setIsSaved(false);
    const tags = tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    try {
      const saved = await discovery.updateSettings({ listed, tags });
      setListed(saved.listed);
      setTagsText(saved.tags.join(', '));
      setIsSaved(true);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t('error.fallback.cannot-save-discovery'),
      );
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <SwitchRow
        title={t('discovery.settings.listed')}
        description={t('discovery.settings.listedHint')}
        checked={listed}
        disabled={!canList}
        onCheckedChange={(checked) => {
          setIsSaved(false);
          setListed(checked);
        }}
      />
      {!settings.eligible ? (
        <Banner variant="info">
          {t('discovery.settings.ineligible', {
            min: DISCOVERY_MIN_MEMBERS,
            count: settings.memberCount,
          })}
        </Banner>
      ) : null}
      <TextField
        label={t('discovery.settings.tags')}
        hint={t('discovery.settings.tagsHint', {
          max: DISCOVERY_MAX_TAGS,
          length: DISCOVERY_TAG_MAX_LENGTH,
        })}
        value={tagsText}
        maxLength={(DISCOVERY_TAG_MAX_LENGTH + 2) * DISCOVERY_MAX_TAGS}
        onChange={(event) => {
          setIsSaved(false);
          setTagsText(event.target.value);
        }}
      />
      <div className={styles.footer}>
        <Button type="submit" disabled={discovery.isSaving}>
          {discovery.isSaving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('discovery.settings.save')}
        </Button>
      </div>
      {actionError ? <Banner variant="danger">{actionError}</Banner> : null}
      {isSaved ? <Banner variant="success">{t('discovery.settings.saved')}</Banner> : null}
    </form>
  );
}
