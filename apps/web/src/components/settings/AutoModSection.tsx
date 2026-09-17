import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { AUTOMOD_MAX_ENABLED_RULES } from '@discord-clone/shared';
import type { AutoModRule, CreateAutoModRuleInput, ServerDetail } from '@/api';
import { Badge, Button, IconButton, Switch } from '@/components/ui';
import { useAutoModRules } from '@/hooks/useAutoModRules';
import { useTranslation, type Translate } from '@/i18n/LocaleProvider';
import { AutoModRuleForm } from './AutoModRuleForm';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './AutoModSection.module.css';

interface AutoModSectionProps {
  server: ServerDetail;
}

/** The server's AutoMod rules. Rendered only for MANAGE_SERVER holders; the API re-checks. */
export function AutoModSection({ server }: AutoModSectionProps) {
  const t = useTranslation();
  const automod = useAutoModRules(server.id);
  // `null` is the list; 'new' or a rule opens the form.
  const [editing, setEditing] = useState<AutoModRule | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const enabledCount = automod.rules.filter((rule) => rule.enabled).length;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallback);
      return false;
    }
  }

  async function save(input: CreateAutoModRuleInput) {
    const target = editing;
    const saved = await run(
      () =>
        target && target !== 'new'
          ? automod.updateRule({ ruleId: target.id, ...input })
          : automod.createRule(input),
      t('error.fallback.cannot-save-automod-rule'),
    );
    if (saved) setEditing(null);
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-automod-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-automod-title">
          {t('automod.section.title', { count: enabledCount, max: AUTOMOD_MAX_ENABLED_RULES })}
        </strong>
        <span>{t('automod.section.hint')}</span>
      </div>
      {actionError ? (
        <p className="empty-note" role="alert">
          {actionError}
        </p>
      ) : null}
      {editing ? (
        <AutoModRuleForm
          key={editing === 'new' ? 'new' : editing.id}
          server={server}
          rule={editing === 'new' ? null : editing}
          isSaving={automod.isSaving}
          onSubmit={save}
          onCancel={() => {
            setActionError(null);
            setEditing(null);
          }}
        />
      ) : (
        <>
          <Button type="button" variant="secondary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden="true" />
            {t('automod.action.add')}
          </Button>
          <div className={settingsStyles.inviteList}>
            {automod.isLoading ? (
              <p className="empty-note" role="status">
                <Loader2 className="spin" size={14} aria-hidden="true" /> {t('automod.loading')}
              </p>
            ) : automod.error ? (
              <p className="empty-note" role="alert">
                {automod.error instanceof Error
                  ? automod.error.message
                  : t('error.fallback.cannot-load-automod-rules')}
              </p>
            ) : automod.rules.length ? (
              automod.rules.map((rule) => (
                <div className={styles.ruleRow} key={rule.id}>
                  <div>
                    <strong>{rule.name}</strong>
                    <small>{ruleSummary(rule, t)}</small>
                  </div>
                  <Badge variant={rule.action === 'ALERT_ONLY' ? 'neutral' : 'danger'}>
                    {t(`automod.actionType.${rule.action}`)}
                  </Badge>
                  <Switch
                    checked={rule.enabled}
                    disabled={automod.pendingRuleId === rule.id}
                    aria-label={t('automod.action.toggle', { name: rule.name })}
                    onCheckedChange={(enabled) =>
                      void run(
                        () => automod.updateRule({ ruleId: rule.id, enabled }),
                        t('error.fallback.cannot-save-automod-rule'),
                      )
                    }
                  />
                  <IconButton
                    label={t('automod.action.edit', { name: rule.name })}
                    size="sm"
                    onClick={() => setEditing(rule)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={t('automod.action.delete', { name: rule.name })}
                    variant="danger"
                    size="sm"
                    disabled={automod.pendingRuleId === rule.id}
                    onClick={() =>
                      void run(
                        () => automod.deleteRule(rule.id),
                        t('error.fallback.cannot-delete-automod-rule'),
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                </div>
              ))
            ) : (
              <p className="empty-note">{t('automod.empty')}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ruleSummary(rule: AutoModRule, t: Translate) {
  switch (rule.triggerType) {
    case 'KEYWORD':
      return t('automod.summary.KEYWORD', { count: rule.terms.length });
    case 'REGEX':
      return t('automod.summary.REGEX', { pattern: rule.pattern ?? '' });
    case 'MENTION_SPAM':
      return t('automod.summary.MENTION_SPAM', { count: rule.mentionLimit ?? 0 });
    case 'INVITE_LINK':
      return t('automod.summary.INVITE_LINK');
    case 'EXTERNAL_LINK':
      return t('automod.summary.EXTERNAL_LINK', { count: rule.allowedDomains.length });
  }
}
