import { useState, type FormEvent } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import type { ServerDetail } from '@/api';
import { Banner, Button, Checkbox } from '@/components/ui';
import { useServerOnboarding } from '@/hooks/useServerOnboarding';
import { useTranslation } from '@/i18n/LocaleProvider';
import { SelfAssignQuestion } from './SelfAssignQuestion';
import styles from './RulesGate.module.css';

interface RulesGateProps {
  server: ServerDetail;
}

/**
 * Shown in place of the channel view while `server.needsOnboarding` is set. The API blocks every
 * participation path until the member accepts, so this screen is a convenience, not the gate itself.
 */
export function RulesGate({ server }: RulesGateProps) {
  const t = useTranslation();
  const onboarding = useServerOnboarding(server.id);
  const [agreed, setAgreed] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const rolesById = new Map(server.roles.map((role) => [role.id, role]));
  const config = onboarding.onboarding;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed) return;
    setActionError(null);
    try {
      await onboarding.acceptOnboarding({ rulesAccepted: true, roleIds });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.fallback.cannot-accept-rules'));
    }
  }

  return (
    <section className={styles.gate} aria-labelledby="rules-gate-title">
      <div className={styles.card}>
        <header className={styles.header}>
          <ScrollText size={20} aria-hidden="true" />
          <div>
            <strong id="rules-gate-title">
              {t('onboarding.gate.title', { name: server.name })}
            </strong>
            <span>{t('onboarding.gate.hint')}</span>
          </div>
        </header>

        {onboarding.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('onboarding.gate.loading')}
          </p>
        ) : onboarding.error || !config ? (
          <p className="empty-note" role="alert">
            {onboarding.error instanceof Error
              ? onboarding.error.message
              : t('error.fallback.cannot-load-onboarding')}
          </p>
        ) : !config.enabled || config.accepted ? (
          // The server detail predates a change (screening turned off, or accepted in another tab).
          <div className={styles.footer}>
            <p className="empty-note">{t('onboarding.gate.stale')}</p>
            <Button type="button" onClick={() => void onboarding.refreshServer()}>
              {t('onboarding.gate.continue')}
            </Button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <div
              className={styles.rules}
              role="region"
              tabIndex={0}
              aria-label={t('onboarding.gate.rulesLabel')}
            >
              {config.rulesText}
            </div>
            <label className={styles.agree}>
              <Checkbox
                checked={agreed}
                aria-label={t('onboarding.gate.agree')}
                onCheckedChange={(checked) => setAgreed(checked === true)}
              />
              <span>{t('onboarding.gate.agree')}</span>
            </label>
            {config.selfAssignQuestions.length ? (
              <div className={styles.questions}>
                <strong>{t('onboarding.gate.questionsTitle')}</strong>
                {config.selfAssignQuestions.map((question) => (
                  <SelfAssignQuestion
                    key={question.id}
                    question={question}
                    rolesById={rolesById}
                    selectedRoleIds={roleIds}
                    disabled={!agreed || onboarding.isAccepting}
                    onChange={setRoleIds}
                  />
                ))}
              </div>
            ) : null}
            {actionError ? <Banner variant="danger">{actionError}</Banner> : null}
            <div className={styles.footer}>
              <Button type="submit" disabled={!agreed || onboarding.isAccepting}>
                {onboarding.isAccepting ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : null}
                {t('onboarding.gate.submit')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
