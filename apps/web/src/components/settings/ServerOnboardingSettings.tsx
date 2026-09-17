import { useRef, useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  ONBOARDING_MAX_QUESTIONS,
  ONBOARDING_RULES_MAX_LENGTH,
  SELF_ASSIGNABLE_ROLE_PERMISSIONS,
} from '@discord-clone/shared';
import type { Role, ServerDetail, ServerOnboarding } from '@/api';
import { Banner, Button, TextArea } from '@/components/ui';
import { useServerOnboarding, type ServerOnboardingState } from '@/hooks/useServerOnboarding';
import { useTranslation } from '@/i18n/LocaleProvider';
import { OnboardingQuestionEditor, type QuestionDraft } from './OnboardingQuestionEditor';
import { SwitchRow } from './SettingsRows';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ServerOnboardingSettings.module.css';

interface ServerOnboardingSettingsProps {
  server: ServerDetail;
}

/** Rules screening config. Rendered only for MANAGE_SERVER holders; the API re-checks. */
export function ServerOnboardingSettings({ server }: ServerOnboardingSettingsProps) {
  const t = useTranslation();
  const onboarding = useServerOnboarding(server.id);

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-onboarding-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-onboarding-title">{t('onboarding.settings.title')}</strong>
        <span>{t('onboarding.settings.hint')}</span>
      </div>
      {onboarding.isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
          {t('onboarding.settings.loading')}
        </p>
      ) : onboarding.error || !onboarding.onboarding ? (
        <p className="empty-note" role="alert">
          {onboarding.error instanceof Error
            ? onboarding.error.message
            : t('error.fallback.cannot-load-onboarding')}
        </p>
      ) : (
        <OnboardingForm server={server} config={onboarding.onboarding} onboarding={onboarding} />
      )}
    </section>
  );
}

interface OnboardingFormProps {
  server: ServerDetail;
  config: ServerOnboarding;
  onboarding: ServerOnboardingState;
}

function OnboardingForm({ server, config, onboarding }: OnboardingFormProps) {
  const t = useTranslation();
  const nextKey = useRef(0);
  const newKey = () => `question-${nextKey.current++}`;
  const [enabled, setEnabled] = useState(config.enabled);
  const [rulesText, setRulesText] = useState(config.rulesText ?? '');
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    config.selfAssignQuestions.map((question) => ({ ...question, key: question.id })),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const roles = server.roles.filter(isSelfAssignableRole);

  function updateQuestion(key: string, patch: Partial<QuestionDraft>) {
    setIsSaved(false);
    setQuestions((current) =>
      current.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setIsSaved(false);
    try {
      const saved = await onboarding.updateOnboarding({
        enabled,
        rulesText,
        selfAssignQuestions: questions.map(({ id, prompt, roleIds, multiSelect }) => ({
          id,
          prompt,
          roleIds,
          multiSelect,
        })),
      });
      // The API drops roles that can no longer be offered; show what was actually stored.
      setQuestions(
        saved.selfAssignQuestions.map((question) => ({ ...question, key: question.id })),
      );
      setIsSaved(true);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t('error.fallback.cannot-save-onboarding'),
      );
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <SwitchRow
        title={t('onboarding.settings.enable')}
        description={t('onboarding.settings.enableHint')}
        checked={enabled}
        onCheckedChange={(checked) => {
          setIsSaved(false);
          setEnabled(checked);
        }}
      />
      <TextArea
        label={t('onboarding.settings.rules')}
        hint={t('onboarding.settings.rulesHint', { max: ONBOARDING_RULES_MAX_LENGTH })}
        value={rulesText}
        rows={6}
        maxLength={ONBOARDING_RULES_MAX_LENGTH}
        required={enabled}
        onChange={(event) => {
          setIsSaved(false);
          setRulesText(event.target.value);
        }}
      />
      <div className={settingsStyles.settingsSectionHeading}>
        <strong>
          {t('onboarding.settings.questions', {
            count: questions.length,
            max: ONBOARDING_MAX_QUESTIONS,
          })}
        </strong>
        <span>{t('onboarding.settings.questionsHint')}</span>
      </div>
      {roles.length ? (
        questions.map((question, index) => (
          <OnboardingQuestionEditor
            key={question.key}
            index={index}
            question={question}
            roles={roles}
            onChange={(patch) => updateQuestion(question.key, patch)}
            onRemove={() => {
              setIsSaved(false);
              setQuestions((current) => current.filter((item) => item.key !== question.key));
            }}
          />
        ))
      ) : (
        <p className="empty-note">{t('onboarding.settings.noRoles')}</p>
      )}
      <div className={styles.footer}>
        {roles.length ? (
          <Button
            type="button"
            variant="secondary"
            disabled={questions.length >= ONBOARDING_MAX_QUESTIONS}
            onClick={() => {
              setIsSaved(false);
              setQuestions((current) => [
                ...current,
                { key: newKey(), prompt: '', roleIds: [], multiSelect: false },
              ]);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t('onboarding.settings.addQuestion')}
          </Button>
        ) : null}
        <Button type="submit" disabled={onboarding.isSaving}>
          {onboarding.isSaving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('onboarding.settings.save')}
        </Button>
      </div>
      {actionError ? <Banner variant="danger">{actionError}</Banner> : null}
      {isSaved ? <Banner variant="success">{t('onboarding.settings.saved')}</Banner> : null}
    </form>
  );
}

const selfAssignablePermissions: ReadonlySet<string> = new Set(SELF_ASSIGNABLE_ROLE_PERMISSIONS);

/** Mirrors the API's rule so the editor only offers roles a save would accept. */
function isSelfAssignableRole(role: Role) {
  return (
    role.name !== '@everyone' &&
    role.permissions.every((permission) => selfAssignablePermissions.has(permission))
  );
}
