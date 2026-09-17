import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import {
  autoModActions,
  autoModTimeoutMinutes,
  autoModTriggerTypes,
  AUTOMOD_MAX_MENTION_LIMIT,
  AUTOMOD_MAX_PATTERN_LENGTH,
} from '@discord-clone/shared';
import type { AutoModRule, CreateAutoModRuleInput, ServerDetail } from '@/api';
import { Button, TextArea, TextField } from '@/components/ui';
import { useTranslation, type MessageKey } from '@/i18n/LocaleProvider';
import { draftFromRule, inputFromDraft, toggleId, type AutoModDraft } from '@/utils/autoModDraft';
import { cn } from '@/utils/cn';
import { CheckRow, SwitchRow } from './SettingsRows';
import { SettingsSelect } from './SettingsSelect';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './AutoModSection.module.css';

const TIMEOUT_LABEL_KEYS: Record<(typeof autoModTimeoutMinutes)[number], MessageKey> = {
  1: 'moderation.timeout.60s',
  5: 'moderation.timeout.5m',
  10: 'moderation.timeout.10m',
  60: 'moderation.timeout.1h',
  1440: 'moderation.timeout.1d',
  10080: 'moderation.timeout.1w',
};

interface AutoModRuleFormProps {
  server: ServerDetail;
  /** Null creates a new rule. */
  rule: AutoModRule | null;
  isSaving: boolean;
  onSubmit: (input: CreateAutoModRuleInput) => Promise<void>;
  onCancel: () => void;
}

export function AutoModRuleForm({
  server,
  rule,
  isSaving,
  onSubmit,
  onCancel,
}: AutoModRuleFormProps) {
  const t = useTranslation();
  const [draft, setDraft] = useState<AutoModDraft>(() => draftFromRule(rule));
  const textChannels = server.channels.filter((channel) => channel.type === 'TEXT');
  const update = (patch: Partial<AutoModDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(inputFromDraft(draft));
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby="automod-form-title">
      <strong id="automod-form-title">
        {t(rule ? 'automod.form.editTitle' : 'automod.form.createTitle')}
      </strong>
      <TextField
        label={t('automod.field.name')}
        value={draft.name}
        maxLength={100}
        required
        onChange={(event) => update({ name: event.target.value })}
      />
      <div className={settingsStyles.settingsGrid}>
        <SettingsSelect
          name="triggerType"
          label={t('automod.field.trigger')}
          defaultValue={draft.triggerType}
          options={autoModTriggerTypes.map((value) => ({
            value,
            label: t(`automod.trigger.${value}`),
          }))}
          onValueChange={(triggerType) => update({ triggerType })}
        />
        <SettingsSelect
          name="action"
          label={t('automod.field.action')}
          defaultValue={draft.action}
          options={autoModActions.map((value) => ({
            value,
            label: t(`automod.actionType.${value}`),
          }))}
          onValueChange={(action) => update({ action })}
        />
      </div>

      {draft.triggerType === 'KEYWORD' ? (
        <TextArea
          label={t('automod.field.terms')}
          hint={t('automod.field.termsHint')}
          value={draft.termsText}
          rows={4}
          required
          onChange={(event) => update({ termsText: event.target.value })}
        />
      ) : null}
      {draft.triggerType === 'REGEX' ? (
        <TextField
          label={t('automod.field.pattern')}
          hint={t('automod.field.patternHint')}
          value={draft.pattern}
          maxLength={AUTOMOD_MAX_PATTERN_LENGTH}
          required
          onChange={(event) => update({ pattern: event.target.value })}
        />
      ) : null}
      {draft.triggerType === 'MENTION_SPAM' ? (
        <TextField
          label={t('automod.field.mentionLimit')}
          hint={t('automod.field.mentionLimitHint')}
          type="number"
          min={1}
          max={AUTOMOD_MAX_MENTION_LIMIT}
          value={draft.mentionLimit}
          required
          onChange={(event) => update({ mentionLimit: event.target.value })}
        />
      ) : null}
      {draft.triggerType === 'EXTERNAL_LINK' ? (
        <TextArea
          label={t('automod.field.allowedDomains')}
          hint={t('automod.field.allowedDomainsHint')}
          value={draft.domainsText}
          rows={3}
          onChange={(event) => update({ domainsText: event.target.value })}
        />
      ) : null}

      {draft.action === 'TIMEOUT_AUTHOR' ? (
        <>
          <SettingsSelect
            name="timeoutMinutes"
            label={t('automod.field.timeout')}
            defaultValue={draft.timeoutMinutes}
            options={autoModTimeoutMinutes.map((minutes) => ({
              value: String(minutes),
              label: t(TIMEOUT_LABEL_KEYS[minutes]),
            }))}
            onValueChange={(timeoutMinutes) => update({ timeoutMinutes })}
          />
          <SwitchRow
            title={t('automod.field.alsoAllow')}
            description={t('automod.field.alsoAllowHint')}
            checked={draft.alsoAllowMessage}
            onCheckedChange={(alsoAllowMessage) => update({ alsoAllowMessage })}
          />
        </>
      ) : null}

      <SettingsSelect
        name="alertChannelId"
        label={t('automod.field.alertChannel')}
        defaultValue={draft.alertChannelId}
        options={[
          { value: '', label: t('automod.field.alertChannelNone') },
          ...textChannels.map((channel) => ({ value: channel.id, label: `#${channel.name}` })),
        ]}
        onValueChange={(alertChannelId) => update({ alertChannelId })}
      />

      <fieldset className={styles.checkGroup}>
        <legend>{t('automod.field.exemptRoles')}</legend>
        <div className={settingsStyles.permissionGrid}>
          {server.roles.map((role) => (
            <CheckRow
              key={role.id}
              className={cn(settingsStyles.checkRow, settingsStyles.permissionTile)}
              label={role.name}
              checked={draft.exemptRoleIds.includes(role.id)}
              onCheckedChange={(checked) =>
                update({ exemptRoleIds: toggleId(draft.exemptRoleIds, role.id, checked) })
              }
            >
              <span>{role.name}</span>
            </CheckRow>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.checkGroup}>
        <legend>{t('automod.field.exemptChannels')}</legend>
        <div className={settingsStyles.permissionGrid}>
          {textChannels.map((channel) => (
            <CheckRow
              key={channel.id}
              className={cn(settingsStyles.checkRow, settingsStyles.permissionTile)}
              label={`#${channel.name}`}
              checked={draft.exemptChannelIds.includes(channel.id)}
              onCheckedChange={(checked) =>
                update({
                  exemptChannelIds: toggleId(draft.exemptChannelIds, channel.id, checked),
                })
              }
            >
              <span>#{channel.name}</span>
            </CheckRow>
          ))}
        </div>
      </fieldset>

      <footer className={styles.formFooter}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('automod.form.save')}
        </Button>
      </footer>
    </form>
  );
}
