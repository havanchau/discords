import { useState, type FormEvent } from 'react';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import { useTranslation } from '../../i18n/LocaleProvider';
import { Button, TextField } from '../ui';
import styles from '../AuthScreen.module.css';

const PASSWORD_PATTERN = '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}';

interface ForgotPasswordFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function ForgotPasswordForm({ isSubmitting, onSubmit, onBack }: ForgotPasswordFormProps) {
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
      <Button type="submit" fullWidth disabled={isSubmitting}>
        {t('auth.action.sendResetLink')}
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t('auth.backToSignIn')}
      </Button>
    </form>
  );
}

interface ResetPasswordFormProps {
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export function ResetPasswordForm({ isSubmitting, onSubmit, onBack }: ResetPasswordFormProps) {
  const t = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mismatch = Boolean(confirmation) && confirmation !== password;

  return (
    <form onSubmit={onSubmit} className={styles.fields}>
      <TextField
        label={t('auth.field.newPassword')}
        name="password"
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        pattern={PASSWORD_PATTERN}
        hint={t('auth.field.passwordHint')}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        leadingIcon={<Lock size={18} aria-hidden="true" />}
      />
      <TextField
        label={t('auth.field.confirmNewPassword')}
        type="password"
        required
        autoComplete="new-password"
        value={confirmation}
        error={mismatch ? t('auth.error.passwordMismatch') : undefined}
        onChange={(event) => setConfirmation(event.target.value)}
        leadingIcon={<Lock size={18} aria-hidden="true" />}
      />
      <Button type="submit" fullWidth disabled={isSubmitting || mismatch || !confirmation}>
        {t('auth.action.updatePassword')}
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t('auth.backToSignIn')}
      </Button>
    </form>
  );
}
