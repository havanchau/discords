import type { FormEvent } from 'react';
import { ArrowLeft, KeyRound, Lock, Mail } from 'lucide-react';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, TextField } from '@/components/ui';
import styles from '@/components/AuthScreen.module.css';

interface CancelDeletionFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

/** Keeps an account in its deletion grace period; its sessions were revoked, so it asks again. */
export function CancelDeletionForm({ isSubmitting, onSubmit, onBack }: CancelDeletionFormProps) {
  const t = useTranslation();

  return (
    <form onSubmit={onSubmit} className={styles.fields}>
      <TextField
        label={t('auth.field.email')}
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder={t('auth.field.emailPlaceholder')}
        leadingIcon={<Mail size={18} aria-hidden="true" />}
      />
      <TextField
        label={t('auth.field.password')}
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="••••••••"
        leadingIcon={<Lock size={18} aria-hidden="true" />}
      />
      <TextField
        label={t('auth.field.authCode')}
        name="code"
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={9}
        pattern="\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}"
        placeholder={t('auth.field.authCodePlaceholder')}
        hint={t('auth.field.cancelDeletionCodeHint')}
        leadingIcon={<KeyRound size={18} aria-hidden="true" />}
      />
      <Button type="submit" fullWidth disabled={isSubmitting}>
        {t('auth.action.keepAccount')}
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t('auth.backToSignIn')}
      </Button>
    </form>
  );
}
