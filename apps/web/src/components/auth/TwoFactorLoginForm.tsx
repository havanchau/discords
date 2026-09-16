import type { FormEvent } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, TextField } from '@/components/ui';
import styles from '@/components/AuthScreen.module.css';

interface TwoFactorLoginFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function TwoFactorLoginForm({ isSubmitting, onSubmit, onBack }: TwoFactorLoginFormProps) {
  const t = useTranslation();

  return (
    <form onSubmit={onSubmit} className={styles.fields}>
      <TextField
        label={t('auth.field.authCode')}
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={9}
        pattern="\d{6}|[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}"
        placeholder={t('auth.field.authCodePlaceholder')}
        hint={t('auth.field.authCodeHint')}
        leadingIcon={<KeyRound size={18} aria-hidden="true" />}
      />
      <Button type="submit" fullWidth disabled={isSubmitting}>
        {t('auth.action.verifyAndSignIn')}
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t('auth.backToSignIn')}
      </Button>
    </form>
  );
}
