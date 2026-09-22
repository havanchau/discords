import { useState, type FormEvent } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import type { Channel } from '@/api';
import { Banner, Button, Checkbox } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './AgeGate.module.css';

interface AgeGateProps {
  channel: Channel;
  /** Records the confirmation and updates the cached user; rejects with a displayable error. */
  confirmAge: () => Promise<void>;
}

/**
 * Shown in place of an age-restricted channel's messages and composer until the user confirms they
 * are 18+. A self-attested checkbox, not age verification; the API refuses the content regardless,
 * so this screen is a convenience, not the gate itself (docs/features/age-restricted-channels.md).
 */
export function AgeGate({ channel, confirmAge }: AgeGateProps) {
  const t = useTranslation();
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      // On success the cached user changes and the channel view replaces this component.
      await confirmAge();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('channel.ageGate.error'));
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.gate} aria-labelledby="age-gate-title">
      <div className={styles.card}>
        <header className={styles.header}>
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong id="age-gate-title">
              {t('channel.ageGate.title', { name: channel.name })}
            </strong>
            <span>{t('channel.ageGate.hint')}</span>
          </div>
        </header>

        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <label className={styles.agree}>
            <Checkbox
              checked={agreed}
              aria-label={t('channel.ageGate.agree')}
              disabled={isSubmitting}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <span>{t('channel.ageGate.agree')}</span>
          </label>
          <p className={styles.note}>{t('channel.ageGate.remembered')}</p>
          {actionError ? <Banner variant="danger">{actionError}</Banner> : null}
          <div className={styles.footer}>
            <Button type="submit" disabled={!agreed || isSubmitting}>
              {isSubmitting ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
              {t('channel.ageGate.submit')}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
