import type { Role, SelfAssignQuestion as SelfAssignQuestionModel } from '@/api';
import { Checkbox } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './RulesGate.module.css';

interface SelfAssignQuestionProps {
  question: SelfAssignQuestionModel;
  rolesById: ReadonlyMap<string, Role>;
  selectedRoleIds: string[];
  disabled: boolean;
  onChange: (roleIds: string[]) => void;
}

/** One question of the rules gate. A single-choice question keeps at most one of its roles checked. */
export function SelfAssignQuestion({
  question,
  rolesById,
  selectedRoleIds,
  disabled,
  onChange,
}: SelfAssignQuestionProps) {
  const t = useTranslation();
  const roles = question.roleIds.flatMap((roleId) => {
    const role = rolesById.get(roleId);
    return role ? [role] : [];
  });
  if (!roles.length) return null;

  function toggle(roleId: string, checked: boolean) {
    if (!checked) {
      onChange(selectedRoleIds.filter((id) => id !== roleId));
      return;
    }
    const kept = question.multiSelect
      ? selectedRoleIds
      : selectedRoleIds.filter((id) => !question.roleIds.includes(id));
    onChange([...kept, roleId]);
  }

  return (
    <fieldset className={styles.question} disabled={disabled}>
      <legend>{question.prompt}</legend>
      <small>
        {t(question.multiSelect ? 'onboarding.question.pickAny' : 'onboarding.question.pickOne')}
      </small>
      <div className={styles.roleGrid}>
        {roles.map((role) => (
          <label className={styles.roleOption} key={role.id}>
            <Checkbox
              checked={selectedRoleIds.includes(role.id)}
              disabled={disabled}
              aria-label={role.name}
              onCheckedChange={(checked) => toggle(role.id, checked === true)}
            />
            <span>{role.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
