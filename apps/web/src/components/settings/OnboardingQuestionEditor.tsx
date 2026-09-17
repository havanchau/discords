import { Trash2 } from 'lucide-react';
import {
  ONBOARDING_MAX_ROLES_PER_QUESTION,
  ONBOARDING_PROMPT_MAX_LENGTH,
} from '@discord-clone/shared';
import type { Role } from '@/api';
import { IconButton, TextField } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import { toggleId } from '@/utils/autoModDraft';
import { cn } from '@/utils/cn';
import { CheckRow, SwitchRow } from './SettingsRows';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ServerOnboardingSettings.module.css';

export interface QuestionDraft {
  /** React key only; `id` is the stored id, absent for a question not saved yet. */
  key: string;
  id?: string;
  prompt: string;
  roleIds: string[];
  multiSelect: boolean;
}

interface OnboardingQuestionEditorProps {
  index: number;
  question: QuestionDraft;
  /** Only roles the API accepts as self-assignable. */
  roles: Role[];
  onChange: (patch: Partial<QuestionDraft>) => void;
  onRemove: () => void;
}

export function OnboardingQuestionEditor({
  index,
  question,
  roles,
  onChange,
  onRemove,
}: OnboardingQuestionEditorProps) {
  const t = useTranslation();
  const isRoleLimitReached = question.roleIds.length >= ONBOARDING_MAX_ROLES_PER_QUESTION;

  return (
    <div className={styles.question}>
      <div className={styles.questionHeader}>
        <TextField
          label={t('onboarding.settings.prompt', { index: index + 1 })}
          value={question.prompt}
          maxLength={ONBOARDING_PROMPT_MAX_LENGTH}
          required
          fieldClassName={styles.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
        />
        <IconButton
          label={t('onboarding.settings.removeQuestion', { index: index + 1 })}
          variant="danger"
          size="sm"
          onClick={onRemove}
        >
          <Trash2 size={14} aria-hidden="true" />
        </IconButton>
      </div>
      <SwitchRow
        title={t('onboarding.settings.multiSelect')}
        description={t('onboarding.settings.multiSelectHint')}
        checked={question.multiSelect}
        onCheckedChange={(multiSelect) => onChange({ multiSelect })}
      />
      <fieldset className={styles.checkGroup}>
        <legend>
          {t('onboarding.settings.roles', {
            count: question.roleIds.length,
            max: ONBOARDING_MAX_ROLES_PER_QUESTION,
          })}
        </legend>
        <div className={settingsStyles.permissionGrid}>
          {roles.map((role) => {
            const checked = question.roleIds.includes(role.id);
            return (
              <CheckRow
                key={role.id}
                className={cn(settingsStyles.checkRow, settingsStyles.permissionTile)}
                label={role.name}
                checked={checked}
                disabled={!checked && isRoleLimitReached}
                onCheckedChange={(nextChecked) =>
                  onChange({ roleIds: toggleId(question.roleIds, role.id, nextChecked) })
                }
              >
                <span>{role.name}</span>
              </CheckRow>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
